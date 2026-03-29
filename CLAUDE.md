  These are the 3 frequencies at which you will operate. you should vibrate to each one fluidly and with ease.

  HEAD DOWN MODE:
  - "Implement exactly: [instructions]"
  - "Direct code change: [what to do]"
  - "Execute only: [task]"

  PLANNING MODE:
  - "Let's plan: [topic]"
  - "Strategy for: [feature]"
  - "Options for: [problem]"

  BRAINSTORMING MODE:
  - "Brainstorm: [idea]"
  - "Explore approaches for: [concept]"
  - "What if we: [scenario]"

  CRITICAL INSTRUCTIONS FOR CLAUDE:

  1. FOLLOW INSTRUCTIONS EXACTLY AS WRITTEN
     - No adding, modifying, or reinterpreting instructions
     - No assumptions about what should be "moved elsewhere" when told to delete
     - When told to remove something, ONLY remove it - nothing else

  2. LITERAL EXECUTION ONLY
     - Do not try to be helpful by adding extra steps
     - Do not try to anticipate additional needs
     - If asked to delete X, delete ONLY X

  3. CONFIRM UNDERSTANDING
     - Repeat back exact instruction before executing
     - Show exactly what will be removed/changed
     - Wait for confirmation on any ambiguity

  4. ZERO CREATIVITY WITH INSTRUCTIONS
     - Instructions are to be treated as exact, literal commands
     - Do not extend the scope of any request
     - Do not add "helpful" improvements

  5. ERROR ON THE SIDE OF DOING LESS
     - When uncertain, do the minimum action that fulfills the request
     - Ask before adding any element not explicitly requested

  VIOLATION OF THESE RULES IS UNACCEPTABLE.



## Project Management
- **TODO.md**: Single source of truth and project roadmap - refer to this file for current priorities and tasks
- **Implementation Order**: Follow the prioritized tasks in TODO.md for all development work
- **Task Tracking**: Update TODO.md as tasks are completed or new requirements emerge

## Development Workflow
1. Work on highest priority tasks from TODO.md first
3. Build UI components separately, then integrate them
4. Test with real Shopify data using existing API endpoints
5. Focus on delivering minimal working versions first

## Code Style
- **Imports**: ES modules with named imports (`import { x } from 'y'`)
- **Formatting**: 2-space indentation, semi-colons required
- **Functions**: Use async/await for asynchronous operations
- **Error Handling**: Try/catch blocks with specific error messages
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Documentation**: JSDoc comments for functions (params and returns)
- **Database**: Use prepared statements with parameter binding
- **API Responses**: Consistent JSON structure with status indicators

## Architecture
- **Backend**: Node.js with native HTTP server
- **Database**: Neon Postgres
- **Frontend**: Vanilla JavaScript (no framework)
- **External APIs**: Shopify integration via GraphQL

## Important Implementation Guidelines
1. **NEVER ADD EXTERNAL DEPENDENCIES**: Always check package.json first and use ONLY existing libraries
2. **SELF-CONTAINED APPLICATION**: No external APIs or services (like Google Charts) under any circumstances
3. **ABSOLUTELY NO CDN IMPORTS OR UNPKG**: All dependencies are already in package.json - use proper ES Module imports
4. **NPM PACKAGES USAGE**: Import packages directly by name (e.g., `import { jsPDF } from 'jspdf'`) NOT via CDN/unpkg
5. **Cell vs Card Distinction**: Always differentiate between the cell (perforated paper area) and the card (content within)
6. **Print Considerations**: Use only grayscale colors that print well (no red highlights)
7. **QR Code Generation**: Use the built-in qrcode library (installed in package.json)
8. **Text Wrapping**: Artwork titles need to support 2-line wrapping
9. **Data Flow**: Prefer server-side rendering of complex elements like QR codes
10. **Thoroughly Review Codebase**: Before making suggestions, study the existing code patterns

## 10X Productivity Framework
1. **Parallel Implementation**: Work on multiple tasks simultaneously from the TODO list
2. **Component-First Approach**: Build reusable components in isolation before integration
3. **Function-By-Function Progress**: Implement one function at a time with working code
4. **Rapid Prototyping**: Build minimal implementations first, then enhance incrementally
5. **Test-As-You-Go**: Create test cases alongside implementation
6. **Code Reuse Strategy**: Identify patterns that can be reused across features
7. **Feature Timeboxing**: Set strict timeboxes (30-60 mins) for feature implementation

## Communication Guidelines
1. **Immediate Acknowledgment**: Respond to feedback with "Understood" and implement fixes
2. **Zero Dependencies Outside Codebase**: NEVER introduce external libraries or services
3. **Preview Implementation Plans**: Share brief implementation steps before coding
4. **Provide Options When Blocked**: Present 2-3 alternatives rather than a single approach
5. **Explicit Progress Updates**: Report % complete on features in progress
6. **Show-Not-Tell**: Demonstrate working code rather than explaining what will work
7. **Ask Clarifying Questions Upfront**: Get all requirements clear before implementation

## Production Hotfixes

### Rule: Minimal Changes Only
When fixing issues in production:
1. Fix ONLY what's broken
2. Make the smallest possible change that fixes the issue
3. NO "improvements" or "while we're here..." changes
4. NO extra validation, logging, or error handling unless absolutely required
5. NO refactoring or cleanup
6. Get it working NOW, improvements can come later

### Example: Bad vs Good
BAD:
```javascript
// Adding validation, extra logging, error handling, etc.
async updateThing(id, data) {
  console.log('Starting update...');
  validateInput(data);
  try {
    const query = `UPDATE things SET ...`;
    const result = await execute(query, [data.field1, data.field2]);
    console.log('Update successful');
    return result;
  } catch (error) {
    console.error('Update failed:', error);
    throw new CustomError(error);
  }
}
```

GOOD:
```javascript
// Just fix what's broken
async updateThing(id, data) {
  const query = `UPDATE things SET ...`;
  return (await execute(query, [data.field1, data.field2])).rows[0];
}
```

### Remember
- Production is not the place for improvements
- Fix it fast, fix it minimal
- Save the improvements for non-emergency updates

