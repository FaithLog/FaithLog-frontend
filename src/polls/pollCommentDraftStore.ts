export type PollCommentDraft = {
  content: string;
  editingCommentId: number | null;
};

const EMPTY_DRAFT: PollCommentDraft = {content: '', editingCommentId: null};

export class PollCommentDraftStore {
  private readonly drafts = new Map<number, PollCommentDraft>();

  get(pollId: number): PollCommentDraft {
    return this.drafts.get(pollId) ?? EMPTY_DRAFT;
  }

  update(pollId: number, content: string) {
    const current = this.get(pollId);
    this.drafts.set(pollId, {...current, content});
  }

  beginEdit(pollId: number, commentId: number, content: string) {
    this.drafts.set(pollId, {content, editingCommentId: commentId});
  }

  clear(pollId: number) {
    this.drafts.delete(pollId);
  }

  open(pollId: number) {
    this.clear(pollId);
  }

  close(pollId: number) {
    this.clear(pollId);
  }

  cancel(pollId: number) {
    this.clear(pollId);
  }

  settle(pollId: number, outcome: 'success' | 'failure') {
    if (outcome === 'success') this.clear(pollId);
  }
}
