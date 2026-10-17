/**
 * 统一异常消息安全提取工具
 */

export function toErrorMessage(
  error: unknown,
  fallback = 'unknown error',
): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === 'string') {
    return error.trim().length > 0 ? error : fallback;
  }
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const msg = (error as { message: string }).message;
    return msg.trim().length > 0 ? msg : fallback;
  }
  if (error !== null && error !== undefined) {
    const str = String(error);
    return str !== '[object Object]' && str.length > 0 ? str : fallback;
  }
  return fallback;
}
