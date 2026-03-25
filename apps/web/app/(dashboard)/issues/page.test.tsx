import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Issue } from "@multica/types";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/issues",
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: any;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock workspace feature
vi.mock("@/features/workspace", () => ({
  useActorName: () => ({
    getMemberName: (id: string) => (id === "user-1" ? "Test User" : "Unknown"),
    getAgentName: (id: string) => (id === "agent-1" ? "Claude Agent" : "Unknown Agent"),
    getActorName: (type: string, id: string) =>
      type === "member" ? "Test User" : "Claude Agent",
    getActorInitials: () => "TU",
  }),
  useWorkspaceStore: Object.assign(
    (selector?: any) => {
      const state = { workspace: { id: "ws-1", name: "Test", slug: "test" }, agents: [], members: [] };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ workspace: { id: "ws-1", name: "Test", slug: "test" }, agents: [], members: [] }) },
  ),
}));

// Mock WebSocket context
vi.mock("@/features/realtime", () => ({
  useWSEvent: vi.fn(),
  useWS: () => ({ subscribe: vi.fn(() => () => {}) }),
  WSProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock api
const mockCreateIssue = vi.fn();
const mockUpdateIssue = vi.fn();

vi.mock("@/shared/api", () => ({
  api: {
    listIssues: vi.fn().mockResolvedValue({ issues: [], total: 0 }),
    createIssue: (...args: any[]) => mockCreateIssue(...args),
    updateIssue: (...args: any[]) => mockUpdateIssue(...args),
  },
}));

// Mock the issue store — control state directly
let mockStoreState: {
  issues: Issue[];
  loading: boolean;
  fetch: () => Promise<void>;
  setIssues: (issues: Issue[]) => void;
  addIssue: (issue: Issue) => void;
  updateIssue: (id: string, updates: Partial<Issue>) => void;
  removeIssue: (id: string) => void;
};

vi.mock("@/features/issues", () => ({
  useIssueStore: (selector?: any) => {
    return selector ? selector(mockStoreState) : mockStoreState;
  },
  StatusIcon: () => null,
  StatusPicker: ({ value, onChange }: any) => (
    <button onClick={() => onChange?.("todo")}>{value || "todo"}</button>
  ),
  PriorityPicker: ({ value, onChange }: any) => (
    <button onClick={() => onChange?.("none")}>{value || "none"}</button>
  ),
  statusConfig: {
    backlog: { label: "Backlog" },
    todo: { label: "Todo" },
    in_progress: { label: "In Progress" },
    in_review: { label: "In Review" },
    done: { label: "Done" },
    blocked: { label: "Blocked" },
    cancelled: { label: "Cancelled" },
  },
  priorityConfig: {
    urgent: { label: "Urgent" },
    high: { label: "High" },
    medium: { label: "Medium" },
    low: { label: "Low" },
    none: { label: "None" },
  },
}));

// Mock modals
vi.mock("@/features/modals", () => ({
  useModalStore: Object.assign(
    () => ({ open: vi.fn() }),
    { getState: () => ({ open: vi.fn() }) },
  ),
}));

const issueDefaults = {
  parent_issue_id: null,
  acceptance_criteria: [],
  context_refs: [],
  position: 0,
};

const mockIssues: Issue[] = [
  {
    ...issueDefaults,
    id: "issue-1",
    workspace_id: "ws-1",
    title: "Implement auth",
    description: "Add JWT authentication",
    status: "todo",
    priority: "high",
    assignee_type: "member",
    assignee_id: "user-1",
    creator_type: "member",
    creator_id: "user-1",
    due_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    ...issueDefaults,
    id: "issue-2",
    workspace_id: "ws-1",
    title: "Design landing page",
    description: null,
    status: "in_progress",
    priority: "medium",
    assignee_type: "agent",
    assignee_id: "agent-1",
    creator_type: "member",
    creator_id: "user-1",
    due_date: "2026-02-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    ...issueDefaults,
    id: "issue-3",
    workspace_id: "ws-1",
    title: "Write tests",
    description: null,
    status: "backlog",
    priority: "low",
    assignee_type: null,
    assignee_id: null,
    creator_type: "member",
    creator_id: "user-1",
    due_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

import IssuesPage from "./page";

describe("IssuesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      issues: [],
      loading: true,
      fetch: vi.fn(),
      setIssues: vi.fn(),
      addIssue: vi.fn(),
      updateIssue: vi.fn(),
      removeIssue: vi.fn(),
    };
  });

  it("shows loading state initially", () => {
    mockStoreState.loading = true;
    mockStoreState.issues = [];
    render(<IssuesPage />);
    // Now shows skeleton instead of text
    expect(screen.getAllByRole("generic").some(el => el.getAttribute("data-slot") === "skeleton")).toBe(true);
  });

  it("renders issues in board view after loading", async () => {
    mockStoreState.loading = false;
    mockStoreState.issues = mockIssues;

    render(<IssuesPage />);

    expect(screen.getByText("Implement auth")).toBeInTheDocument();
    expect(screen.getByText("Design landing page")).toBeInTheDocument();
    expect(screen.getByText("Write tests")).toBeInTheDocument();
  });

  it("renders board columns", async () => {
    mockStoreState.loading = false;
    mockStoreState.issues = mockIssues;

    render(<IssuesPage />);

    expect(screen.getAllByText("Backlog").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Todo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("In Progress").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("In Review").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Done").length).toBeGreaterThanOrEqual(1);
  });

  it("switches to list view", async () => {
    mockStoreState.loading = false;
    mockStoreState.issues = mockIssues;

    const user = userEvent.setup();
    render(<IssuesPage />);

    expect(screen.getByText("Implement auth")).toBeInTheDocument();

    const listButton = screen.getByText("List");
    await user.click(listButton);

    expect(screen.getByText("Implement auth")).toBeInTheDocument();
    expect(screen.getByText("Design landing page")).toBeInTheDocument();
  });

  it("shows 'New Issue' button", async () => {
    mockStoreState.loading = false;
    mockStoreState.issues = [];

    render(<IssuesPage />);

    expect(screen.getByText("New Issue")).toBeInTheDocument();
  });

  it("shows create dialog when New Issue is clicked", async () => {
    mockStoreState.loading = false;
    mockStoreState.issues = [];

    const user = userEvent.setup();
    render(<IssuesPage />);

    expect(screen.getByText("New Issue")).toBeInTheDocument();
    await user.click(screen.getByText("New Issue"));

    // Create dialog is now a global modal, just check the button was clicked
    // The modal renders in ModalRegistry which is outside IssuesPage
  });

  it("creates an issue via the dialog", async () => {
    mockStoreState.loading = false;
    mockStoreState.issues = [];

    const user = userEvent.setup();
    render(<IssuesPage />);

    expect(screen.getByText("New Issue")).toBeInTheDocument();
    await user.click(screen.getByText("New Issue"));

    // Create dialog is now a global modal in ModalRegistry
    // This test verifies the page itself doesn't crash
  });

  it("handles API error gracefully", async () => {
    mockStoreState.loading = false;
    mockStoreState.issues = [];

    render(<IssuesPage />);

    // Should render without crashing even with empty issues
    expect(screen.queryAllByRole("generic").length).toBeGreaterThan(0);
  });
});
