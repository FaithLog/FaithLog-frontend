import type {ApiError} from './types';

export class FaithLogApiError extends Error {
  readonly detail: ApiError;

  constructor(detail: ApiError) {
    super(detail.message);
    this.name = 'FaithLogApiError';
    this.detail = detail;
  }
}
