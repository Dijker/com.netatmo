module.exports = {
  'root': true,
  'parserOptions': {
    'ecmaVersion': 6,
    'sourceType': 'script',
    'ecmaFeatures': {
    },
  },
  'globals': {
    'Homey': false,
    '__': false,
  },
  'env': {
    'browser': true,
    'node': true,
  },
  'rules': {
    // require use strict in all files (to enable let & const in node 4)
    'strict': [2, 'global'],
    // require all requires be top-level
    'global-require': 2,
    // enforces error handling in callbacks (node environment)
    'handle-callback-err': 1,
    // disallow mixing regular variable and require declarations
    'no-mixed-requires': [0, false],
    // suggest using of const declaration for variables that are never modified after declared
    'prefer-const': 1,
    // disallow modifying variables that are declared using const
    'no-const-assign': 2,
    // require let or const instead of var
    'no-var': 2,
    // disallow use of the Object constructor
    'no-new-object': 2,
    // require method and property shorthand syntax for object literals
    'object-shorthand': [1, 'always'],
    // require quotes around object literal property names
    'quote-props': [2, 'as-needed', {
      'keywords': false,
      'unnecessary': true,
      'numbers': false,
    }],
    // disallow use of the Array constructor
    'no-array-constructor': 2,
    // enforces return statements in callbacks of array's methods
    'array-callback-return': 2,
    // require the use of single quotes
    'quotes': [2, 'single', 'avoid-escape'],
    // suggest using template literals instead of string concatenation
    'prefer-template': 1,
    // enforce usage of spacing in template strings
    'template-curly-spacing': 1,
    // disallow unnecessary string escaping
    'no-useless-escape': 2,
    // disallow creation of functions within loops
    'no-loop-func': 2,
    // suggest using arrow functions as callbacks
    'prefer-arrow-callback': [2, {
      'allowNamedFunctions': false,
      'allowUnboundThis': true,
    }],
    // require space before/after arrow function's arrow
    'arrow-spacing': [1, {
      'before': true,
      'after': true,
    }],
    // require parens in arrow function arguments
    'arrow-parens': [1, 'as-needed'],
    // enforces no braces where they can be omitted
    'arrow-body-style': [1, 'as-needed'],
    'no-confusing-arrow': [1, {
      'allowParens': true,
    }],
    // disallow unnecessary constructor (probably not needed yet since node 4 does not support classes)
    'no-useless-constructor': 2,
    // disallow duplicate class members
    'no-dupe-class-members': 2,
    // disallow usage of __iterator__ property
    'no-iterator': 1,
    // encourages use of dot notation whenever possible
    'dot-notation': [2, { 'allowKeywords': true }],
    // allow just one var statement per function
    'one-var': [1, 'never'],
    // require a newline around variable declaration
    'one-var-declaration-per-line': [2, 'always'],
    // require the use of === and !==
    'eqeqeq': 1,
    // disallow lexical declarations in case/default clauses
    'no-case-declarations': 2,
    // disallow the use of Boolean literals in conditional expressions
    // also, prefer `a || b` over `a ? a : b`
    'no-unneeded-ternary': 2,
    // enforce one true brace style
    'brace-style': [2, '1tbs', { 'allowSingleLine': true }],
    // this option sets a specific tab width for your code
    'indent': [2, 'tab', { 'SwitchCase': 1, 'VariableDeclarator': 1 }],
    // require or disallow space before blocks
    'space-before-blocks': 1,
    // require a space before & after certain keywords
    'keyword-spacing': [1, {
      'before': true,
      'after': true,
      'overrides': {
        'return': { 'after': true },
        'throw': { 'after': true },
        'case': { 'after': true },
      },
    }],
    // require spaces around operators
    'space-infix-ops': 1,
    // enforces new line after each method call in the chain to make it
    // more readable and easy to maintain
    'newline-per-chained-call': [1, { 'ignoreChainWithDepth': 3 }],
    // disallow whitespace before properties
    'no-whitespace-before-property': 2,
    // enforce padding within blocks
    'padded-blocks': [1, 'never'],
    // require or disallow spaces inside parentheses
    'space-in-parens': [1, 'never'],
    // enforce spacing inside array brackets
    'array-bracket-spacing': [1, 'never'],
    // require padding inside curly braces
    'object-curly-spacing': [1, 'always'],
    // specify the maximum length of a line in your program
    'max-len': [1, 120, 2, {
      'ignoreUrls': true,
      'ignoreComments': false
    }],
    // enforce one true comma style
    'comma-style': [2, 'last'],
    // require trailing commas in multiline object literals
    'comma-dangle': [1, 'always-multiline'],
    // enforce spacing before and after semicolons
    'semi-spacing': [2, {
      'before': false,
      'after': true,
    }],
    // require or disallow use of semicolons instead of ASI
    'semi': [2, 'always'],
    // require use of the second argument for parseInt()
    'radix': 2,
    // require camel case names
    'camelcase': [1, { 'properties': 'never' }],
    // require a capital letter for constructors
    'new-cap': [2, {
      'newIsCap': true,
    }],
  },
};
