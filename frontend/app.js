document.addEventListener('DOMContentLoaded', () => {
  const uploadBox = document.getElementById('upload-box');
  const fileInput = document.getElementById('file-input');
  const textInput = document.getElementById('text-input');
  const solveBtn = document.getElementById('solve-btn');
  const resultsDiv = document.getElementById('results');

  uploadBox.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  uploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = '#4285f4';
    uploadBox.style.backgroundColor = 'rgba(66, 133, 244, 0.1)';
  });

  uploadBox.addEventListener('dragleave', () => {
    uploadBox.style.borderColor = '#dadce0';
    uploadBox.style.backgroundColor = 'transparent';
  });

  uploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = '#dadce0';
    uploadBox.style.backgroundColor = 'transparent';

    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  solveBtn.addEventListener('click', async () => {
    const problem = textInput.value.trim();
    if (problem) {
      await solveProblem(problem);
    } else {
      alert('Please enter a math problem or upload an image');
    }
  });

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      solveBtn.click();
    }
  });

  function handleFileUpload(file) {
    uploadBox.querySelector('p').textContent = file.name;
    
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        uploadBox.querySelector('.upload-icon').innerHTML = 
          `<img src="${e.target.result}" style="max-height: 60px;">`;
        processImage(file);
      };
      reader.readAsDataURL(file);
    }
  }

  async function processImage(file) {
    showLoading();
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      
      if (data.error) {
        showError(data.error, data.suggestion);
      } else {
        showMathSolution(data);
      }
    } catch (error) {
      console.error('Image processing error:', error);
      showError("Failed to process image", "Please try a clearer image or type the problem manually");
    }
  }

  async function solveProblem(problem) {
    showLoading();
    try {
      const response = await fetch('/api/solve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ problem })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Solution failed');
      }

      if (data.error) {
        showError(data.error, data.suggestion);
      } else {
        showMathSolution(data);
      }
    } catch (error) {
      console.error('Problem solving error:', error);
      showError(error.message, "Check your input format and try again");
    }
  }

  function showLoading() {
    solveBtn.disabled = true;
    solveBtn.innerHTML = 'Solving <span class="loading"></span>';
    resultsDiv.innerHTML = '';
  }

  function showMathSolution(data) {
    solveBtn.disabled = false;
    solveBtn.textContent = 'Solve';
    
    let html = `
      <div class="problem-type">${formatProblemType(data.type)}</div>
      <div class="problem">Problem: ${data.problem || data.extractedText}</div>
      <div class="solution">Solution: ${formatSolution(data.solution, data.type)}</div>
    `;
    
    if (data.steps && data.steps.length > 0) {
      html += `<div class="steps-title">Step-by-Step Solution:</div>`;
      html += `<div class="steps-container">`;
      data.steps.forEach(step => {
        html += `
          <div class="step">
            <div class="step-action">${step.action}</div>
            <div class="step-math">${formatMathExpression(step.math)}</div>
            ${step.explanation ? `<div class="step-explanation">${step.explanation}</div>` : ''}
          </div>
        `;
      });
      html += `</div>`;
    }
    
    resultsDiv.innerHTML = html;
    
    // Render math expressions with KaTeX if available
    if (typeof katex !== 'undefined') {
      document.querySelectorAll('.step-math').forEach(element => {
        try {
          katex.render(element.textContent, element, {
            throwOnError: false
          });
        } catch (e) {
          console.error('KaTeX rendering error:', e);
        }
      });
    }
  }

  function formatSolution(solution, type) {
    if (type === 'integration' && !solution.includes('Numerical')) {
      return solution + " + C";
    }
    return solution;
  }

  function formatMathExpression(expr) {
    // Simple formatting for better display of math expressions
    return expr
      .replace(/\*/g, '×')
      .replace(/\//g, '÷')
      .replace(/\^/g, '<sup>')
      .replace(/(\d+)/g, '<span class="math-expression">$1</span>');
  }

  function showError(message, suggestion = '') {
    solveBtn.disabled = false;
    solveBtn.textContent = 'Solve';
    
    let html = `<div class="error">${message}</div>`;
    if (suggestion) {
      html += `<div class="suggestion">${suggestion}</div>`;
    }
    
    resultsDiv.innerHTML = html;
  }

  function formatProblemType(type) {
    const types = {
      'differentiation': 'Differentiation Problem',
      'integration': 'Integration Problem',
      'algebra': 'Algebra Problem',
      'arithmetic': 'Arithmetic Problem',
      'limit': 'Limit Problem'
    };
    return types[type] || 'Math Problem';
  }
});