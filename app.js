const expressionInput = document.getElementById("expression");
const resultEl = document.getElementById("result");
const angleModeEl = document.getElementById("angle-mode");
const historyList = document.getElementById("history-list");

let angleMode = "DEG";
let memoryValue = 0;
let history = [];

const OPERATORS = {
  "+": { prec: 2, assoc: "L", args: 2, fn: (a, b) => a + b },
  "-": { prec: 2, assoc: "L", args: 2, fn: (a, b) => a - b },
  "*": { prec: 3, assoc: "L", args: 2, fn: (a, b) => a * b },
  "/": { prec: 3, assoc: "L", args: 2, fn: (a, b) => a / b },
  "%": { prec: 3, assoc: "L", args: 2, fn: (a, b) => a % b },
  "^": { prec: 4, assoc: "R", args: 2, fn: (a, b) => Math.pow(a, b) },
  "u-": { prec: 5, assoc: "R", args: 1, fn: (a) => -a },
};

const FUNCTIONS = {
  sin: (x) => Math.sin(toRadians(x)),
  cos: (x) => Math.cos(toRadians(x)),
  tan: (x) => Math.tan(toRadians(x)),
  asin: (x) => fromRadians(Math.asin(x)),
  acos: (x) => fromRadians(Math.acos(x)),
  atan: (x) => fromRadians(Math.atan(x)),
  log: (x) => Math.log10(x),
  ln: (x) => Math.log(x),
  sqrt: (x) => Math.sqrt(x),
  abs: (x) => Math.abs(x),
  fact: (x) => factorial(x),
  pow: (x, y) => Math.pow(x, y),
};

const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
};

function toRadians(value) {
  return angleMode === "DEG" ? (value * Math.PI) / 180 : value;
}

function fromRadians(value) {
  return angleMode === "DEG" ? (value * 180) / Math.PI : value;
}

function factorial(n) {
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error("Factorial requires a non-negative integer");
  }
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t" || ch === "\n") {
      i += 1;
      continue;
    }

    if ("()+-*/%^,".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let num = ch;
      i += 1;
      while (i < input.length && /[0-9.]/.test(input[i])) {
        num += input[i];
        i += 1;
      }
      if (num.split(".").length > 2) {
        throw new Error("Invalid number format");
      }
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let name = ch;
      i += 1;
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        name += input[i];
        i += 1;
      }
      tokens.push({ type: "name", value: name.toLowerCase() });
      continue;
    }

    throw new Error(`Unexpected character: ${ch}`);
  }

  return insertImplicitMultiplication(tokens);
}

function insertImplicitMultiplication(tokens) {
  const output = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const current = tokens[i];
    const prev = output[output.length - 1];

    if (
      prev &&
      isValueToken(prev) &&
      (current.value === "(" || current.type === "name" || current.type === "number")
    ) {
      output.push({ type: "op", value: "*" });
    }

    output.push(current);
  }
  return output;
}

function isValueToken(token) {
  if (token.type === "number") return true;
  if (token.type === "name" && token.value in CONSTANTS) return true;
  if (token.value === ")") return true;
  return false;
}

function toRPN(tokens) {
  const output = [];
  const stack = [];

  let prevToken = null;

  for (const token of tokens) {
    if (token.type === "number") {
      output.push(token);
    } else if (token.type === "name") {
      if (token.value in CONSTANTS) {
        output.push({ type: "number", value: CONSTANTS[token.value] });
      } else {
        stack.push({ type: "func", value: token.value });
      }
    } else if (token.value === ",") {
      while (stack.length && stack[stack.length - 1].value !== "(") {
        output.push(stack.pop());
      }
      if (!stack.length) throw new Error("Misplaced comma");
    } else if (token.value === "(") {
      stack.push(token);
    } else if (token.value === ")") {
      while (stack.length && stack[stack.length - 1].value !== "(") {
        output.push(stack.pop());
      }
      if (!stack.length) throw new Error("Mismatched parentheses");
      stack.pop();
      if (stack.length && stack[stack.length - 1].type === "func") {
        output.push(stack.pop());
      }
    } else if (token.type === "op") {
      let op = token.value;
      const isUnary =
        !prevToken ||
        (prevToken.type === "op" && prevToken.value !== ")") ||
        prevToken.value === "(" ||
        prevToken.value === ",";
      if (op === "-" && isUnary) {
        op = "u-";
      }
      const o1 = OPERATORS[op];
      if (!o1) throw new Error(`Unknown operator: ${op}`);
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.type === "func") {
          output.push(stack.pop());
          continue;
        }
        if (top.type === "op" && top.value in OPERATORS) {
          const o2 = OPERATORS[top.value];
          if ((o1.assoc === "L" && o1.prec <= o2.prec) || (o1.assoc === "R" && o1.prec < o2.prec)) {
            output.push(stack.pop());
            continue;
          }
        }
        break;
      }
      stack.push({ type: "op", value: op });
    }

    prevToken = token;
  }

  while (stack.length) {
    const item = stack.pop();
    if (item.value === "(") throw new Error("Mismatched parentheses");
    output.push(item);
  }

  return output;
}

function evalRPN(rpn) {
  const stack = [];
  for (const token of rpn) {
    if (token.type === "number") {
      stack.push(token.value);
      continue;
    }

    if (token.type === "op") {
      const op = OPERATORS[token.value];
      if (stack.length < op.args) throw new Error("Invalid expression");
      const args = stack.splice(-op.args);
      const value = op.fn(...args);
      stack.push(value);
      continue;
    }

    if (token.type === "func") {
      const fn = FUNCTIONS[token.value];
      if (!fn) throw new Error(`Unknown function: ${token.value}`);

      const argCount = fn.length;
      if (stack.length < argCount) throw new Error("Invalid function arguments");
      const args = stack.splice(-argCount);
      const value = fn(...args);
      stack.push(value);
      continue;
    }
  }

  if (stack.length !== 1 || !Number.isFinite(stack[0])) {
    throw new Error("Invalid expression");
  }

  return stack[0];
}

function evaluateExpression(input) {
  const tokens = tokenize(input);
  const rpn = toRPN(tokens);
  return evalRPN(rpn);
}

function updateResult(value) {
  resultEl.textContent = Number.isFinite(value) ? value : "Error";
}

function addHistory(expression, value) {
  history.unshift({ expression, value });
  history = history.slice(0, 20);
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = "";
  for (const item of history) {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = item.expression;
    li.appendChild(strong);
    li.appendChild(document.createTextNode(String(item.value)));
    li.addEventListener("click", () => {
      expressionInput.value = item.expression;
      updateResult(item.value);
    });
    historyList.appendChild(li);
  }
}

function insertText(value) {
  const start = expressionInput.selectionStart || 0;
  const end = expressionInput.selectionEnd || 0;
  const text = expressionInput.value;
  expressionInput.value = text.slice(0, start) + value + text.slice(end);
  const newPos = start + value.length;
  expressionInput.setSelectionRange(newPos, newPos);
  expressionInput.focus();
}

function clearAll() {
  expressionInput.value = "";
  updateResult(0);
}

function deleteOne() {
  const start = expressionInput.selectionStart || 0;
  const end = expressionInput.selectionEnd || 0;
  if (start !== end) {
    const text = expressionInput.value;
    expressionInput.value = text.slice(0, start) + text.slice(end);
    expressionInput.setSelectionRange(start, start);
    return;
  }
  if (start === 0) return;
  const text = expressionInput.value;
  expressionInput.value = text.slice(0, start - 1) + text.slice(end);
  expressionInput.setSelectionRange(start - 1, start - 1);
}

function calculate() {
  const expr = expressionInput.value.trim();
  if (!expr) return;
  try {
    const value = evaluateExpression(expr);
    updateResult(value);
    addHistory(expr, value);
  } catch (err) {
    updateResult("Error");
  }
}

function toggleAngleMode() {
  angleMode = angleMode === "DEG" ? "RAD" : "DEG";
  angleModeEl.textContent = angleMode;
}

function applyMemory(action) {
  const current = Number(resultEl.textContent);
  switch (action) {
    case "mc":
      memoryValue = 0;
      break;
    case "mr":
      insertText(String(memoryValue));
      break;
    case "mplus":
      memoryValue += current || 0;
      break;
    case "mminus":
      memoryValue -= current || 0;
      break;
    case "ms":
      memoryValue = current || 0;
      break;
    default:
      break;
  }
}

function onKeypadClick(event) {
  const button = event.target.closest("button");
  if (!button) return;

  const action = button.dataset.action;
  const insert = button.dataset.insert;

  if (action) {
    if (["mc", "mr", "mplus", "mminus", "ms"].includes(action)) {
      applyMemory(action);
      return;
    }

    switch (action) {
      case "clear":
        clearAll();
        break;
      case "delete":
        deleteOne();
        break;
      case "equals":
        calculate();
        break;
      case "angle":
        toggleAngleMode();
        break;
      case "clear-history":
        history = [];
        renderHistory();
        break;
      default:
        break;
    }
    return;
  }

  if (insert) {
    insertText(insert);
  }
}

expressionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    calculate();
  } else if (event.key === "Escape") {
    clearAll();
  }
});

document.addEventListener("click", onKeypadClick);

updateResult(0);
renderHistory();
