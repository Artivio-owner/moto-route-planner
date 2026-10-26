/** Ошибка, текст которой можно показать пользователю. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
  }
}
