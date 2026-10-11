declare module 'body-parser' {
  export function json(
    options?: Record<string, unknown>,
  ): import('express').RequestHandler;
  export function urlencoded(
    options?: Record<string, unknown>,
  ): import('express').RequestHandler;
}
