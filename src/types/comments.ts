/** Comments on BOQ elements and items (docs/comments-plan.md, first release). */

export type CommentAnchorKind = 'boq_element' | 'boq_item';

export interface CommentAuthor {
  id: number;
  name: string;
  initials: string;
  avatarUrl: string | null;
}

export interface CommentEntry {
  clientUuid: string;
  body: string;
  author: CommentAuthor;
  createdAt: string;
  editedAt?: string | null;
  /** True until the sync queue confirms it landed. */
  pending?: boolean;
}

export interface CommentThread {
  clientUuid: string;
  anchorKind: CommentAnchorKind;
  anchorClientUuid: string;
  status: 'open' | 'resolved';
  comments: CommentEntry[];
}

/** Key a thread by its target so the UI looks it up from an element/item id. */
export const commentTargetKey = (kind: CommentAnchorKind, anchorClientUuid: string) =>
  `${kind}:${anchorClientUuid}`;
