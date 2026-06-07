/**
 * @fileoverview Terminal layout region calculations for split-screen rendering.
 * Computes content area width, sidebar width, and row allocations for the dual-layer rendering strategy.
 * @module @my-agent/cli/lib/terminal-layout
 */

/** Terminal layout regions for Ink content + manual sidebar rendering */
export interface LayoutRegion {
  /** Real terminal dimensions (unmodified) */
  realColumns: number
  realRows: number
  /** Columns available for Ink rendering (content area) */
  contentWidth: number
  /** Columns for the right sidebar */
  sidebarWidth: number
  /** 1-based column where sidebar begins (contentWidth + 1) */
  sidebarStartCol: number
  /** Rows available for content area (excluding title, input, statusbar) */
  contentRows: number
}

const SIDEBAR_RATIO = 0.2
const MIN_SIDEBAR_WIDTH = 20
const MIN_CONTENT_WIDTH = 50
const MIN_COLUMNS_FOR_SIDEBAR = 70

/**
 * Calculate layout regions based on real terminal dimensions.
 * When the terminal is too narrow (< MIN_COLUMNS_FOR_SIDEBAR), the sidebar is hidden
 * and Ink uses the full terminal width.
 */
export function calculateLayout(columns: number, rows: number): LayoutRegion {
  const showSidebar = columns >= MIN_COLUMNS_FOR_SIDEBAR

  if (!showSidebar) {
    return {
      realColumns: columns,
      realRows: rows,
      contentWidth: columns,
      sidebarWidth: 0,
      sidebarStartCol: 0,
      contentRows: Math.max(1, rows - 4),
    }
  }

  const sidebarWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(columns * SIDEBAR_RATIO))
  const contentWidth = Math.max(MIN_CONTENT_WIDTH, columns - sidebarWidth)
  const contentRows = Math.max(1, rows - 4)

  return {
    realColumns: columns,
    realRows: rows,
    contentWidth,
    sidebarWidth,
    sidebarStartCol: contentWidth + 1,
    contentRows,
  }
}

/**
 * Effective width Ink should use for rendering.
 * When sidebar is shown, this is narrower than real terminal width.
 */
export function inkWidth(layout: LayoutRegion): number {
  return layout.contentWidth
}
