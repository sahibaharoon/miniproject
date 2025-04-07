require('dotenv').config();
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
require('nerdamer/Extra');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const visionClient = new ImageAnnotatorClient({
  credentials: process.env.GOOGLE_CLOUD_CREDENTIALS ? JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS) : undefined,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'), {
  index: 'frontpage.html'
}));

// Route handlers
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/frontpage.html'));
});

app.get('/solver', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Enhanced Math Processing Functions
function identifyProblemType(problem) {
  if (typeof problem !== 'string') return 'arithmetic';
  
  const lowerProblem = problem.toLowerCase().replace(/\s+/g, '');
  
  // Enhanced differentiation detection
  if (/diff\([^,]+,[^)]+\)/.test(lowerProblem) || 
      /d\/dx\([^)]+\)/.test(lowerProblem) ||
      /derivativeof/.test(lowerProblem)) {
    return 'differentiation';
  }
  
  // Enhanced integration detection
  if (/int\([^,]+,[^)]+\)/.test(lowerProblem) || 
      /∫/.test(lowerProblem) ||
      /integralof/.test(lowerProblem)) {
    return 'integration';
  }
  
  if (/limit|lim\(/.test(lowerProblem)) {
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
  
  // Handle case-insensitive trigonometric functions and remove spaces between function and arguments
  expr = expr.replace(/(sin|cos|tan|sec|csc|cot)\s*\(/gi, '$1(');
  
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

// Add custom math functions for case-insensitive trigonometric functions
const customMath = {
  ...math,
  Sin: math.sin,
  Cos: math.cos,
  Tan: math.tan,
  Sec: math.sec,
  Csc: math.csc,
  Cot: math.cot
};

function advancedDifferentiation(expression, variable = 'x') {
  const steps = [];
  let result;

  try {
    // Step 1: Direct computation
    result = nerdamer(`diff(${expression}, ${variable})`).toString();
    steps.push({
      action: "Direct Computation",
      math: `\\frac{d}{d${variable}}(${expression})`,
      result: result,
      explanation: "Attempted direct differentiation using standard rules"
    });

    // Step 2: Handle special cases if direct computation failed
    if (result.includes('diff')) {
      const specialCases = {
        'sin': 'cos',
        'cos': '-sin',
        'tan': 'sec^2',
        'ln': '1/',
        'exp': 'exp',
        'sqrt': '1/(2*sqrt)',
        'asin': '1/sqrt(1-',
        'acos': '-1/sqrt(1-',
        'atan': '1/(1+'
      };

      for (const [fn, derivative] of Object.entries(specialCases)) {
        if (expression.includes(fn)) {
          const pattern = new RegExp(`${fn}\\(([^)]+)\\)`);
          const match = expression.match(pattern);
          if (match) {
            const inner = match[1];
            result = `${derivative.replace('sqrt', `sqrt(${inner})`)}${inner !== variable ? ` * diff(${inner},${variable})` : ''}`;
            steps.push({
              action: "Special Function Rule",
              math: `\\frac{d}{d${variable}}(${expression})`,
              result: result,
              explanation: `Applied ${fn} function derivative rule`
            });
            break;
          }
        }
      }
    }

    // Step 3: Final simplification
    const simplified = nerdamer(result).expand().toString();
    if (simplified !== result) {
      steps.push({
        action: "Simplification",
        math: result,
        result: simplified,
        explanation: "Simplified the derivative expression"
      });
      result = simplified;
    }

    return { result, steps };
  } catch (error) {
    console.error('Advanced differentiation error:', error);
    throw new Error('Failed to compute derivative');
  }
}

function generateSteps(problem, type) {
  const steps = [];
  let solution = null;
  const cleanedProblem = cleanMathExpression(problem);

  try {
    switch(type) {
      case 'differentiation':
        const diffMatch = cleanedProblem.match(/diff\(([^,]+),([^)]+)\)/);
        if (!diffMatch) {
          throw new Error('Invalid differentiation format');
        }

        const expression = diffMatch[1];
        const variable = diffMatch[2] || 'x';
        
        const { result, steps: diffSteps } = advancedDifferentiation(expression, variable);
        steps.push({
          action: "Problem Identified",
          math: `\\frac{d}{d${variable}}(${expression})`,
          explanation: "Recognized as differentiation problem"
        });
        steps.push(...diffSteps);
        solution = result;
        break;

      case 'integration':
        const intMatch = cleanedProblem.match(/int\(([^,]+),([^)]+)\)/);
        if (!intMatch) {
          throw new Error('Invalid integration format');
        }

        const integrand = intMatch[1];
        const intVar = intMatch[2] || 'x';
        
        steps.push({
          action: "Problem Identified",
          math: `\\int ${integrand} \\, d${intVar}`,
          explanation: "Recognized as integration problem"
        });

        const integral = nerdamer(`integrate(${integrand}, ${intVar})`).toString();
        steps.push({
          action: "Integration Applied",
          math: `\\int ${integrand} \\, d${intVar}`,
          result: integral,
          explanation: "Applied standard integration techniques"
        });

        solution = integral + " + C";
        break;

      case 'algebra':
        const solved = nerdamer.solve(cleanedProblem, 'x');
        if (solved.length === 0) {
          throw new Error("No solutions found");
        }
        solution = solved.toString();
        break;

      case 'limit':
        const limitValue = nerdamer(cleanedProblem.replace(/lim\(([^,]+),([^)]+)\)/, 'limit($1,$2)')).evaluate();
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
          let evalResult = customMath.evaluate(cleanedProblem);
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

// API Endpoints
app.post('/api/solve', async (req, res) => {
  try {
    const { problem } = req.body;
    
    if (!problem || typeof problem !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid input',
        suggestion: 'Please provide a valid mathematical expression'
      });
    }
    
    const type = identifyProblemType(problem);
    const { solution, steps } = generateSteps(problem, type);
    
    res.json({
      type,
      problem: problem.length > 100 ? `${problem.substring(0, 100)}...` : problem,
      solution,
      steps,
      fullProblem: problem.length > 100 ? problem : undefined
    });
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(400).json({ 
      error: 'Unable to solve',
      suggestion: 'Try a different format or simpler expression',
      details: error.message
    });
  }
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const [result] = await visionClient.textDetection(req.file.buffer);
    const text = result.textAnnotations?.[0]?.description || '';
    
    if (!text) {
      return res.status(400).json({ error: 'No math problem found in image' });
    }
    
    const cleanedText = cleanMathExpression(text);
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
    res.status(400).json({ 
      error: 'Image processing failed',
      suggestion: 'Try a clearer image or type the problem manually',
      details: error.message
    });
  }
});

function detailedArithmeticSteps(expr) {
  const steps = [];
  let node;
  try {
    // Use customMath parser to handle case-insensitive trigonometric functions
    node = customMath.parse(expr);
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
      const result = customMath.evaluate(subExpr);
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
    } else if (node.type === 'FunctionNode') {
      // Handle function calls with customMath
      const args = node.args.map(arg => traverse(arg));
      const result = customMath.evaluate(`${node.name}(${args.join(',')})`);
      const roundedResult = (typeof result === 'number') ? roundToThree(result) : result;
      steps.push({
        action: "Evaluate Function",
        math: `${node.name}(${args.join(',')}) = ${roundedResult}`,
        explanation: `Computed ${node.name}(${args.join(',')}) to yield ${roundedResult}.`
      });
      return roundedResult;
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});