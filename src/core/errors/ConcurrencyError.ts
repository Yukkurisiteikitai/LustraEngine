export class ConcurrencyError extends Error {
  constructor(message = '競合が発生しました。再試行してください。') {
    super(message);
    this.name = 'ConcurrencyError';
  }
}
