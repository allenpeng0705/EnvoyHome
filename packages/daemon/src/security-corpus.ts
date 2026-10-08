// Appendix C.3 path-traversal corpus — Plan B3 / V-SEC-2.
// Fixture-driven: the test file iterates this list; adding a bypass means
// adding a row here first (same discipline as Appendix C.4 for smart-home).

export type CorpusExpect = "deny" | "allow";

export interface PathCorpusCase {
  /** Stable id for failure messages. */
  readonly id: string;
  /** Relative (or absolute / Windows) path presented to safeJoin. */
  readonly path: string;
  readonly expect: CorpusExpect;
  /** Optional note from Design Appendix C.3. */
  readonly note?: string;
}

/**
 * Paths that must deny (Design Appendix C.3), plus a few allow controls so the
 * fixture cannot pass by denying everything.
 */
export const PATH_TRAVERSAL_CORPUS: readonly PathCorpusCase[] = [
  {
    id: "dotdot-sibling-account",
    path: "../b/files/x",
    expect: "deny",
    note: "cross-account via ..",
  },
  {
    id: "dotdot-share-bounce",
    path: "../../share/../a",
    expect: "deny",
    note: "escape via share then back",
  },
  {
    id: "absolute-etc-passwd",
    path: "/etc/passwd",
    expect: "deny",
    note: "absolute path outside sandbox",
  },
  {
    id: "windows-drive-under-posix",
    path: "C:\\Windows\\System32\\config\\SAM",
    expect: "deny",
    note: "Windows C:\\ when root is POSIX",
  },
  {
    id: "windows-drive-forward-slash",
    path: "C:/Windows/System32/drivers/etc/hosts",
    expect: "deny",
  },
  {
    id: "null-byte",
    path: "documents/evil\0.txt",
    expect: "deny",
    note: "null byte",
  },
  {
    id: "null-byte-suffix",
    path: "documents/ok.txt\0/../../etc/passwd",
    expect: "deny",
  },
  {
    id: "dotdot-encoded-segment",
    path: "documents/../../b/files/x",
    expect: "deny",
  },
  {
    id: "absolute-tmp",
    path: "/tmp/envoyhome-escape",
    expect: "deny",
  },
  // Allow controls — relative paths under the account files root.
  {
    id: "allow-documents",
    path: "documents/hello.txt",
    expect: "allow",
  },
  {
    id: "allow-output-nested",
    path: "output/reports/a.md",
    expect: "allow",
  },
  {
    id: "allow-knowledge",
    path: "knowledge/note.md",
    expect: "allow",
  },
  {
    id: "allow-dot-segment",
    path: "documents/./readme.md",
    expect: "allow",
  },
];

/** Corpus ids that Appendix C.3 names explicitly — kept for coverage asserts. */
export const APPENDIX_C3_REQUIRED_IDS = [
  "dotdot-sibling-account",
  "dotdot-share-bounce",
  "absolute-etc-passwd",
  "windows-drive-under-posix",
  "null-byte",
] as const;
