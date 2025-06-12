require('dotenv').config();
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const math = require('mathjs');
const cors = require('cors');
const path = require('path');
const nerdamer = require('nerdamer');
require('nerdamer/Calculus');
require('nerdamer/Algebra');
require('nerdamer/Solve');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

let visionClient;

if (process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
  const decodedKey = Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 'base64').toString('utf-8');
  const keyPath = './service-account.json';
  const fs = require('fs');
  fs.writeFileSync(keyPath, decodedKey);

  visionClient = new ImageAnnotatorClient({
    keyFilename: keyPath
  });
} else {
  console.error("GOOGLE_APPLICATION_CREDENTIALS_BASE64 env variable not found.");
  process.exit(1);
}


app.use(cors());
app.use(express.json());
// Serve static files from the frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve frontpage.html at "/"
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/frontpage.html'));
});

// Serve index.html (the math solver UI) at "/solver"
app.get('/solver', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/', (req, res) => {
  res.json({ message: 'MathGPT API is running!' });
});

// Enhanced Math Processing Functions
function identifyProblemType(problem) {
  if (typeof problem !== 'string') return 'arithmetic';
  
  const lowerProblem = problem.toLowerCase();
  
  // Enhanced integration detection
  if (/(?:integrate|∫|int\(.*\)|integral)/.test(lowerProblem) || 
      /(?:find the integral|compute the integral|evaluate the integral)/.test(lowerProblem)) {
    return 'integration';
  }
  
  // Enhanced differentiation detection
  if (/(?:derivative|differentiate|d\/dx|′|diff\(.*\)|d\/dx\(.*\))/.test(lowerProblem) || 
      /(?:find the derivative|compute the derivative|evaluate the derivative)/.test(lowerProblem)) {
    return 'differentiation';
  }
  
  if (/limit|lim\s*\(/.test(lowerProblem)) {
    return 'limit';
  }
  
  if (/solve|=/.test(lowerProblem)) {
    return 'algebra';
  }
  
  return 'arithmetic';
}

function cleanMathExpression(expr) {
  if (typeof expr !== 'string') return '';
  
  // Handle multi-line expressions
  expr = expr.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Handle differentiation
  expr = expr.replace(/d\/dx\s*\(([^)]+)\)/g, 'diff($1,x)');
  expr = expr.replace(/d\/dx\s*\[([^\]]+)\]/g, 'diff($1,x)');
  expr = expr.replace(/derivative\s+of\s+([^,]+)(?:\s+with\s+respect\s+to\s+(\w+))?/gi, 
    (match, fn, varName) => `diff(${fn},${varName || 'x'})`);
  
  // Handle integration
  expr = expr.replace(/∫\s*([^ ]+)\s*dx/g, 'integrate($1,x)');
  expr = expr.replace(/∫\s*([^ ]+)\s*d(\w+)/g, 'integrate($1,$2)');
  expr = expr.replace(/integral\s+of\s+([^,]+)(?:\s+with\s+respect\s+to\s+(\w+))?/gi,
    (match, fn, varName) => `integrate(${fn},${varName || 'x'})`);
  
  // Normalize operators - handle all variations of operators
  expr = expr.replace(/[×xX]/g, '*');  // Handle multiplication
  expr = expr.replace(/[÷]/g, '/');    // Handle division
  expr = expr.replace(/\^/g, '^');     // Handle exponentiation
  expr = expr.replace(/[−-]/g, '-');   // Handle subtraction
  expr = expr.replace(/[+]/g, '+');    // Handle addition
  
  // Remove any trailing periods
  expr = expr.replace(/\.$/, '');
  
  // Remove extra spaces
  expr = expr.replace(/\s+/g, '');
  
  return expr;
}

// Helper: round number to 3 decimal places.
function roundToThree(num) {
  return Math.round(num * 1000) / 1000;
}

// Detailed step-by-step evaluation for arithmetic expressions.
function detailedArithmeticSteps(expr) {
  const steps = [];
  let node;
  try {
    node = math.parse(expr);
  } catch (e) {
    steps.push({ 
      action: "Parse Error", 
      math: expr, 
      explanation: "Could not parse the expression." 
    });
    return steps;
  }
  
  function traverse(node) {
    if (node.type === 'OperatorNode') {
      const leftVal = traverse(node.args[0]);
      const rightVal = traverse(node.args[1]);
      const subExpr = `${leftVal} ${node.op} ${rightVal}`;
      const result = math.evaluate(subExpr);
      const roundedResult = (typeof result === 'number') ? roundToThree(result) : result;
      steps.push({
        action: "Evaluate Sub-expression",
        math: `${subExpr} = ${roundedResult}`,
        explanation: `Computed ${leftVal} ${node.op} ${rightVal} to yield ${roundedResult}.`
      });
      return roundedResult;
    } else if (node.type === 'ConstantNode') {
      return node.value;
    } else if (node.type === 'ParenthesisNode') {
      return traverse(node.content);
    } else {
      const evaluated = node.evaluate();
      return (typeof evaluated === 'number') ? roundToThree(evaluated) : evaluated;
    }
  }
  
  const finalResult = traverse(node);
  const roundedFinal = (typeof finalResult === 'number') ? roundToThree(finalResult) : finalResult;
  steps.push({
    action: "Final Evaluation",
    math: `${expr} = ${roundedFinal}`,
    explanation: `The final computed result is ${roundedFinal}.`
  });
  return steps;
}

// Enhanced Step Generator with Detailed Step-by-Step Computation
function generateSteps(problem, type) {
  const steps = [];
  let solution = null;
  const cleanedProblem = cleanMathExpression(problem);
  
  try {
    switch(type) {
      case 'differentiation':
        steps.push({ 
          action: "Original Function Identified", 
          math: `f(x) = ${problem}`,
          explanation: "Recognized as a differentiation problem."
        });
        
        // Extract the function to differentiate
        let functionToDiff = cleanedProblem;
        if (cleanedProblem.includes('diff(')) {
          functionToDiff = cleanedProblem.match(/diff\(([^,]+),/)?.[1] || cleanedProblem;
        } else if (cleanedProblem.includes('d/dx')) {
          functionToDiff = cleanedProblem.replace(/d\/dx\s*\(?([^)]+)\)?/, '$1');
        }
        
        // Clean up the function expression
        functionToDiff = functionToDiff.replace(/\s+/g, '');
        
        // Use Nerdamer's built-in differentiation
        const derivative = nerdamer(`diff(${functionToDiff},x)`).toString();
        steps.push({
          action: "Apply Differentiation Rules",
          math: `Applying d/dx to ${functionToDiff}`,
          explanation: "Using standard differentiation rules."
        });
        
        // For numerical results, if any evaluation happens, use roundToThree
        const simplified = nerdamer(derivative).expand().toString();
        steps.push({
          action: "Simplify Result",
          math: `f'(x) = ${simplified}`,
          explanation: "Simplified the derivative expression."
        });
        
        solution = simplified;
        break;

      case 'integration':
        steps.push({
          action: "Integral Identified",
          math: `∫${problem} dx`,
          explanation: "Recognized as an integration problem."
        });
        
        // Extract the function to integrate
        let functionToIntegrate = cleanedProblem;
        if (cleanedProblem.includes('integrate(')) {
          functionToIntegrate = cleanedProblem.match(/integrate\(([^,]+),/)?.[1] || cleanedProblem;
        } else if (cleanedProblem.includes('∫')) {
          functionToIntegrate = cleanedProblem.replace(/∫\s*([^ ]+)\s*d\w+/, '$1');
        }
        
        // Clean up the function expression
        functionToIntegrate = functionToIntegrate.replace(/\s+/g, '');
        
        // Use Nerdamer's built-in integration
        const integral = nerdamer(`integrate(${functionToIntegrate},x)`).toString();
        steps.push({
          action: "Apply Integration Rules",
          math: `Finding antiderivative of ${functionToIntegrate}`,
          explanation: "Using standard integration techniques."
        });
        
        const simplifiedIntegral = nerdamer(integral).expand().toString();
        steps.push({
          action: "Simplify Result",
          math: `∫${functionToIntegrate} dx = ${simplifiedIntegral} + C`,
          explanation: "Simplified the integral expression."
        });
        
        solution = simplifiedIntegral + " + C";
        break;

      case 'algebra':
        steps.push({
          action: "Equation Identified",
          math: problem,
          explanation: "Recognized as an algebraic equation."
        });
        const solved = nerdamer.solve(cleanedProblem, 'x');
        if (solved.length === 0) {
          throw new Error("No solutions found");
        }
        const solutionText = solved.toString();
        steps.push({
          action: "Equation Solved",
          math: `x = ${solutionText}`,
          explanation: "Applied algebraic manipulation to isolate the variable."
        });
        solution = solutionText;
        break;

      case 'limit':
        steps.push({
          action: "Limit Identified",
          math: `lim ${problem}`,
          explanation: "Recognized as a limit problem."
        });
        const limitExpr = cleanedProblem.replace(/lim\s*\(?([^)]*)\)?\s*→\s*(\w+)/i, 'limit($1,$2)');
        const limitValue = nerdamer(limitExpr).evaluate();
        steps.push({
          action: "Limit Evaluated",
          math: `lim ${problem} = ${limitValue}`,
          explanation: "Applied limit laws and substitution."
        });
        solution = limitValue.toString();
        break;

      default: // Arithmetic evaluation
        steps.push({
          action: "Expression Parsed",
          math: problem,
          explanation: "Evaluating the arithmetic expression step by step."
        });
        const detailedSteps = detailedArithmeticSteps(cleanedProblem);
        steps.push(...detailedSteps);
        try {
          let evalResult = math.evaluate(cleanedProblem);
          if (typeof evalResult === 'number') {
            evalResult = roundToThree(evalResult);
          }
          solution = evalResult;
        } catch (e) {
          throw new Error("Invalid arithmetic expression");
        }
    }
  } catch (error) {
    steps.push({ 
      action: "Processing Error", 
      math: problem,
      explanation: `Could not process this problem: ${error.message}`
    });
    console.error('Math processing error:', error);
    return { solution: null, steps };
  }

  return { solution, steps };
}

// Enhanced API Endpoints with Better Error Handling
app.post('/api/solve', async (req, res) => {
  try {
    const { problem } = req.body;
    
    if (!problem || typeof problem !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid input',
        suggestion: 'Please provide a valid mathematical expression'
      });
    }
    
    const displayProblem = problem.length > 100 ? `${problem.substring(0, 100)}...` : problem;
    const type = identifyProblemType(problem);
    const { solution, steps } = generateSteps(problem, type);
    
    if (solution === null) {
      return res.status(400).json({ 
        error: 'Unsolvable expression',
        suggestion: 'Try a different format or a simpler expression',
        problem: displayProblem,
        type
      });
    }
    
    res.json({
      type,
      problem: displayProblem,
      solution,
      steps,
      fullProblem: problem.length > 100 ? problem : undefined
    });
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 5MB)' });
    }
    
    const [result] = await visionClient.textDetection(req.file.buffer);
    const text = result.textAnnotations?.[0]?.description || '';
    
    if (!text) {
      return res.status(400).json({ error: 'No text found in image' });
    }
    
    const cleanedText = text
      .replace(/\s+/g, ' ')
      .replace(/(\d)\s*([+\-*/^])\s*(\d)/g, '$1$2$3')
      .replace(/\s*=\s*/g, '=')
      .replace(/\[/g, '(').replace(/\]/g, ')')
      .replace(/\{/g, '(').replace(/\}/g, ')')
      .trim();
    
    const type = identifyProblemType(cleanedText);
    const { solution, steps } = generateSteps(cleanedText, type);
    
    res.json({
      type,
      extractedText: cleanedText.length > 150 ? `${cleanedText.substring(0, 150)}...` : cleanedText,
      solution,
      steps,
      fullText: cleanedText.length > 150 ? cleanedText : undefined
    });
    
  } catch (error) {
    console.error('Image processing error:', error);
    res.status(500).json({ 
      error: 'Image processing failed',
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});