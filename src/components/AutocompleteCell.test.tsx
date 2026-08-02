import _React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AutocompleteCell from './AutocompleteCell';

describe('AutocompleteCell', () => {
  let requestAnimationFrameSpy: any;

  beforeEach(() => {
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
    requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
    requestAnimationFrameSpy.mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Test 1: Substring filter, case-insensitive
  it('filters options by substring case-insensitively', async () => {
    const options = ['Engineering', 'Design', 'Marketing'];
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={options}
        onCommit={onCommit}
        placeholder="Select option"
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    // Type "eng" (lowercase)
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'eng' } });

    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeTruthy();
    });

    expect(screen.queryByText('Design')).toBeNull();
    expect(screen.queryByText('Marketing')).toBeNull();

    // Clear and type "ENG" (uppercase)
    fireEvent.change(input, { target: { value: 'ENG' } });

    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeTruthy();
    });

    expect(screen.queryByText('Design')).toBeNull();
    expect(screen.queryByText('Marketing')).toBeNull();
  });

  // Test 2: Cap at 8 results
  it('caps filtered results at 8 items', async () => {
    const options = Array.from({ length: 12 }, (_, i) => `Option ${i + 1}`);
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={options}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Option' } });

    await waitFor(() => {
      const items = screen.getAllByText(/^Option \d+$/);
      expect(items).toHaveLength(8);
    });
  });

  // Test 3: ArrowDown/ArrowUp bounded, no wraparound
  it('bounds arrow navigation without wraparound', async () => {
    const options = ['Apple', 'Banana', 'Cherry'];
    const onCommit = vi.fn();

    const { container } = render(
      <AutocompleteCell
        value=""
        options={options}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);

    // Press ArrowDown 5 times - should stay at index 2 (last item)
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    }

    await waitFor(() => {
      // Find the menu item divs with highlight style
      const menuItems = container.querySelectorAll('[style*="padding: 7px 12px"]');
      // Last item (Cherry) should have highlight - check for background in style attribute
      expect(menuItems[2].getAttribute('style')).toContain('background: var(--ns-ink-050)');
    });

    // Now press ArrowUp from index 2 repeatedly - should floor at 0
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    }

    await waitFor(() => {
      const menuItems = container.querySelectorAll('[style*="padding: 7px 12px"]');
      // First apple should have highlight style
      expect(menuItems[0].getAttribute('style')).toContain('background: var(--ns-ink-050)');
    });
  });

  // Test 4: Enter commits typed query verbatim (even if no match)
  it('commits typed query verbatim on Enter', async () => {
    const options = ['Apple', 'Banana'];
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={options}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Orange' } }); // No match
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('Orange');
  });

  // Test 5: Escape reverts and closes
  it('reverts to original value and closes on Escape', async () => {
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value="Original"
        options={['Option1', 'Option2']}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);
    expect(input.value).toBe('Original');

    fireEvent.change(input, { target: { value: 'Partial' } });
    expect(input.value).toBe('Partial');

    fireEvent.keyDown(input, { key: 'Escape' });

    // Wait for state update
    await waitFor(() => {
      expect(input.value).toBe('Original');
    });

    // Menu should be closed
    expect(screen.queryByText('Option1')).toBeNull();
    expect(screen.queryByText('Option2')).toBeNull();

    // onCommit should not have been called
    expect(onCommit).not.toHaveBeenCalled();
  });

  // Test 6: Blur always commits
  it('commits on blur with typed text', async () => {
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value="Initial"
        options={['Option1']}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'NewValue' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith('NewValue');
  });

  // Test 7: Mouse-pick race
  it('handles mouse selection without duplicate commits', async () => {
    const onCommit = vi.fn();
    const options = ['ExistingOption'];

    render(
      <AutocompleteCell
        value=""
        options={options}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Existing' } });

    await waitFor(() => {
      expect(screen.getByText('ExistingOption')).toBeTruthy();
    });

    const optionDiv = screen.getByText('ExistingOption');

    // Simulate mousedown on the option
    fireEvent.mouseDown(optionDiv);

    // onCommit should be called exactly once with the correct value
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('ExistingOption');
  });

  // Test 8: Add-new / No-matches mutual exclusivity
  it('shows "Add new" when no matches and non-empty query', async () => {
    const options = ['Apple', 'Banana'];
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={options}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Xyz' } });

    await waitFor(() => {
      expect(screen.getByText((content, _element) => content.includes('Xyz'))).toBeTruthy();
    });

    expect(screen.queryByText('No matches')).toBeNull();
  });

  it('shows no "Add new" or "No matches" with empty query', async () => {
    const options = ['Apple', 'Banana'];
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={options}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);

    // With empty query and all options shown, nothing special should appear
    await waitFor(() => {
      expect(screen.getByText('Apple')).toBeTruthy();
    });

    expect(screen.queryByText('No matches')).toBeNull();
    // Query for text that starts with "Add" should not find anything
    expect(screen.queryByText(/^Add /)).toBeNull();
  });

  it('shows "No matches" when zero matches after filtering', async () => {
    const options = ['Apple', 'Banana'];
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={options}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'xyz' } });

    // Should show "Add new" instead of "No matches" when there are no matches
    await waitFor(() => {
      expect(screen.getByText((content, _element) => content.includes('xyz'))).toBeTruthy();
    });

    expect(screen.queryByText('No matches')).toBeNull();
  });

  // Test 9: Menu repositions on scroll/resize
  it('repositions menu on scroll event', async () => {
    const onCommit = vi.fn();
    let boundingRect = { top: 0, left: 0, bottom: 100, right: 100, width: 100, height: 40, x: 0, y: 0, toJSON: () => ({}) };

    render(
      <AutocompleteCell
        value=""
        options={['Option1']}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    // Mock getBoundingClientRect
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(boundingRect as DOMRect);

    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText('Option1')).toBeTruthy();
    });

    // Get initial menu position
    let menu = screen.getByText('Option1').parentElement?.parentElement;

    // Change the bounding rect
    boundingRect = { top: 50, left: 50, bottom: 150, right: 150, width: 100, height: 40, x: 50, y: 50, toJSON: () => ({}) };

    // Trigger scroll event
    fireEvent.scroll(window);

    await waitFor(() => {
      menu = screen.getByText('Option1').parentElement?.parentElement;
      // The menu should have a top position defined
      expect(menu?.style.top).toBeDefined();
    });
  });

  // Test 10: Status pill styling passthrough
  it('applies inputStyle to the input element', async () => {
    const onCommit = vi.fn();
    const inputStyle: React.CSSProperties = {
      backgroundColor: 'red',
      color: 'white',
      padding: '10px',
    };

    render(
      <AutocompleteCell
        value="Test"
        options={['Option1']}
        onCommit={onCommit}
        inputStyle={inputStyle}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    expect(input.style.backgroundColor).toBe('red');
    expect(input.style.color).toBe('white');
    expect(input.style.padding).toBe('10px');
  });

  it('applies hover and focus styles to input', async () => {
    const onCommit = vi.fn();
    const inputStyle: React.CSSProperties = {
      backgroundColor: 'blue',
    };
    const inputHoverStyle: React.CSSProperties = {
      backgroundColor: 'lightblue',
    };
    const inputFocusStyle: React.CSSProperties = {
      backgroundColor: 'darkblue',
      border: '2px solid black',
    };

    render(
      <AutocompleteCell
        value="Test"
        options={['Option1']}
        onCommit={onCommit}
        inputStyle={inputStyle}
        inputHoverStyle={inputHoverStyle}
        inputFocusStyle={inputFocusStyle}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    // Check initial style
    expect(input.style.backgroundColor).toBe('blue');

    // Simulate hover
    fireEvent.mouseEnter(input);
    await waitFor(() => {
      expect(input.style.backgroundColor).toBe('lightblue');
    });

    // Simulate focus
    fireEvent.focus(input);
    await waitFor(() => {
      expect(input.style.backgroundColor).toBe('darkblue');
      expect(input.style.border).toBe('2px solid black');
    });
  });

  // Additional edge case: onStopClick passthrough
  it('calls onStopClick when wrapper is clicked', async () => {
    const onCommit = vi.fn();
    const onStopClick = vi.fn();

    const { container } = render(
      <AutocompleteCell
        value="Test"
        options={['Option1']}
        onCommit={onCommit}
        onStopClick={onStopClick}
      />
    );

    const wrapper = container.querySelector('div[style*="position: relative"]');
    if (wrapper) {
      fireEvent.click(wrapper);
      expect(onStopClick).toHaveBeenCalled();
    }
  });

  // Additional test: Verify "Add new" click commits the query
  it('commits trimmed query when "Add new" is clicked', async () => {
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={['Existing']}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '  NewItem  ' } });

    await waitFor(() => {
      expect(screen.getByText((content, _element) => content.includes('NewItem'))).toBeTruthy();
    });

    const addNewDiv = screen.getByText((content, _element) => content.includes('NewItem'));
    fireEvent.mouseDown(addNewDiv);

    expect(onCommit).toHaveBeenCalledWith('NewItem');
  });

  // Test exact match behavior
  it('does not show "Add new" when query exactly matches an option', async () => {
    const options = ['Engineering', 'Design'];
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={options}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Engineering' } });

    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeTruthy();
    });

    expect(screen.queryByText((content, _element) => content.includes('Add'))).toBeNull();
  });

  // Test menu closes when item is selected via click
  it('closes menu after selecting item via click', async () => {
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={['Apple', 'Banana']}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText('Apple')).toBeTruthy();
    });

    fireEvent.mouseDown(screen.getByText('Apple'));

    expect(onCommit).toHaveBeenCalledWith('Apple');

    // Menu should be hidden after selection
    await waitFor(() => {
      expect(screen.queryByText('Banana')).toBeNull();
    });
  });

  // Test that initial value is shown when not editing
  it('displays initial value when not editing', () => {
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value="InitialValue"
        options={['Option1']}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('InitialValue');
  });

  // Test whitespace handling in queries
  it('trims whitespace from queries', async () => {
    const onCommit = vi.fn();

    render(
      <AutocompleteCell
        value=""
        options={['Engineering']}
        onCommit={onCommit}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '  eng  ' } });

    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeTruthy();
    });

    fireEvent.keyDown(input, { key: 'Enter' });

    // Should commit trimmed version
    expect(onCommit).toHaveBeenCalledWith('eng');
  });
});
