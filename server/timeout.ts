/**
 * Timeout utility for async operations
 * Prevents hanging requests that cause 502 errors
 */

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = "Operation timed out"
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Timeout for AI operations - 60 seconds to allow DeepSeek multi-step tool calls to complete
 */
export const AI_TIMEOUT_MS = 60000;

/**
 * Wrapper for AI operations with timeout
 */
export async function withAITimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = AI_TIMEOUT_MS
): Promise<T> {
  return withTimeout(
    operation(),
    timeoutMs,
    "AI analysis timed out. Please try a simpler query or try again later."
  );
}