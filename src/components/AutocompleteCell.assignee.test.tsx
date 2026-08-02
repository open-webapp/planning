import _React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AutocompleteCell from './AutocompleteCell';

describe('AutocompleteCell with empty customAssignees (assignee use case)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('with empty options array, typing shows only "Add ..." row', async () => {
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={[]}  // Empty - no seeded names
        placeholder="Assignee"
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    // Focus the input
    fireEvent.focus(input);

    // Initially, with empty query, no menu items should appear
    expect(screen.queryByText(/Add /)).toBeNull();

    // Type a query
    fireEvent.change(input, { target: { value: 'NewAssignee' } });

    // With non-empty query and empty options, should show only "Add ..." row
    await waitFor(() => {
      expect(screen.getByText(/NewAssignee/)).toBeTruthy();
    });
  });

  it('with empty options, opening cell shows only "Add ..." when value is set', async () => {
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value="CurrentAssignee"
        options={[]}  // Empty options
        placeholder="Assignee"
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    // Focus to open menu
    fireEvent.focus(input);

    // With non-empty value and empty options, should show "Add "CurrentAssignee""
    await waitFor(() => {
      expect(screen.getByText(/CurrentAssignee/)).toBeTruthy();
    });

    // Clear and type something new
    fireEvent.change(input, { target: { value: 'Search' } });

    // Should show "Add "Search""
    await waitFor(() => {
      expect(screen.getByText(/Search/)).toBeTruthy();
    });
  });

  it('clicking "Add ..." commits the typed value and calls onCommit with ADD_CUSTOM_VALUE dispatch', async () => {
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={[]}
        placeholder="Assignee"
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Alice' } });

    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeTruthy();
    });

    fireEvent.mouseDown(screen.getByText(/Alice/));

    expect(onCommit).toHaveBeenCalledWith('Alice');
  });
});
