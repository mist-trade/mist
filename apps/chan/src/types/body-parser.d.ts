declare module 'body-parser' {
  export function json(options?: Record<string, unknown>): any;
  export function urlencoded(options?: Record<string, unknown>): any;
}
