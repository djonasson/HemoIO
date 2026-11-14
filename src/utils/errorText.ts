/**
 * What a failed error says: its name and message, never its stack. It is
 * shown on screen only, so the user can tell what went wrong.
 */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name;
  return String(error);
}

/**
 * A stack line naming a place in a script: "at name (url:line:column)" in
 * Chrome, "name@url:line:column" in Firefox and Safari. Anything else in a
 * stack, the message above all, may hold values from the user's data.
 */
const CODE_LOCATION = /^(?:at .*|[\w$.<>/]*@)(?:https?|blob|file):\/\/\S+:\d+:\d+\)?$/;

/**
 * What the user can copy to report a failure: the message, where in the code
 * it failed and the browser. A built script's line and column lead back to
 * the source through the source map of the same build.
 */
export function errorDetails(error: unknown): string {
  const stack = error instanceof Error ? (error.stack ?? '') : '';
  const where = stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => CODE_LOCATION.test(line));
  return [errorText(error), 'Where:', ...(where.length > 0 ? where : ['unknown']), `Browser: ${navigator.userAgent}`].join(
    '\n'
  );
}
