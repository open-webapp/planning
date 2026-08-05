import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Collapsible from './Collapsible'

describe('Collapsible', () => {
  beforeEach(() => {
    // Reset any mocks or state before each test
  })

  afterEach(() => {
    cleanup()
  })

  it('renders label when closed', () => {
    render(
      <Collapsible label="Test Label" defaultOpen={false}>
        <p>Hidden content</p>
      </Collapsible>
    )

    const label = screen.getByText('Test Label')
    expect(label).toBeTruthy()
  })

  it('does not render children when defaultOpen is false', () => {
    render(
      <Collapsible label="Test Label" defaultOpen={false}>
        <p>Hidden content</p>
      </Collapsible>
    )

    const hiddenContent = screen.queryByText('Hidden content')
    expect(hiddenContent).toBeNull()
  })

  it('renders children when defaultOpen is true', () => {
    render(
      <Collapsible label="Test Label" defaultOpen={true}>
        <p>Visible content</p>
      </Collapsible>
    )

    const visibleContent = screen.getByText('Visible content')
    expect(visibleContent).toBeTruthy()
  })

  it('toggles open/close on header click', () => {
    render(
      <Collapsible label="Toggle Test" defaultOpen={false}>
        <p>Content</p>
      </Collapsible>
    )

    // Initially closed
    let content = screen.queryByText('Content')
    expect(content).toBeNull()

    // Click header to expand - the label is inside the clickable div
    const label = screen.getByText('Toggle Test')
    const header = label.closest('div')
    expect(header).toBeTruthy()
    if (header) {
      fireEvent.click(header)
    }

    // Now should be visible
    content = screen.queryByText('Content')
    expect(content).toBeTruthy()

    // Click again to collapse
    if (header) {
      fireEvent.click(header)
    }

    // Should be hidden again
    content = screen.queryByText('Content')
    expect(content).toBeNull()
  })

  it('chevron rotates on toggle', () => {
    const { container } = render(
      <Collapsible label="Chevron Test" defaultOpen={false}>
        <p>Content</p>
      </Collapsible>
    )

    // Find the ChevronDown SVG
    const chevron = container.querySelector('svg')
    expect(chevron).toBeTruthy()

    // When closed, should be rotated -90deg
    let style = chevron?.style.transform
    expect(style).toBe('rotate(-90deg)')

    // Click to open - the label is inside the clickable div
    const label = screen.getByText('Chevron Test')
    const header = label.closest('div')
    expect(header).toBeTruthy()
    if (header) {
      fireEvent.click(header)
    }

    // When open, should be rotated 0deg
    style = chevron?.style.transform
    expect(style).toBe('rotate(0deg)')

    // Click to close
    if (header) {
      fireEvent.click(header)
    }

    // Back to -90deg
    style = chevron?.style.transform
    expect(style).toBe('rotate(-90deg)')
  })

  it('supports multiple children elements', () => {
    render(
      <Collapsible label="Multi Child" defaultOpen={true}>
        <div>
          <p>First paragraph</p>
          <p>Second paragraph</p>
          <span>A span element</span>
        </div>
      </Collapsible>
    )

    expect(screen.getByText('First paragraph')).toBeTruthy()
    expect(screen.getByText('Second paragraph')).toBeTruthy()
    expect(screen.getByText('A span element')).toBeTruthy()
  })

  it('handles defaultOpen undefined (should default to false)', () => {
    render(
      <Collapsible label="No Default">
        <p>Content</p>
      </Collapsible>
    )

    const content = screen.queryByText('Content')
    expect(content).toBeNull()
  })

  it('can toggle multiple times in sequence', () => {
    render(
      <Collapsible label="Multi Toggle" defaultOpen={false}>
        <p>Content</p>
      </Collapsible>
    )

    const label = screen.getByText('Multi Toggle')
    const header = label.closest('div')
    expect(header).toBeTruthy()

    // Toggle 1: open
    if (header) fireEvent.click(header)
    expect(screen.getByText('Content')).toBeTruthy()

    // Toggle 2: close
    if (header) fireEvent.click(header)
    expect(screen.queryByText('Content')).toBeNull()

    // Toggle 3: open
    if (header) fireEvent.click(header)
    expect(screen.getByText('Content')).toBeTruthy()

    // Toggle 4: close
    if (header) fireEvent.click(header)
    expect(screen.queryByText('Content')).toBeNull()

    // Toggle 5: open
    if (header) fireEvent.click(header)
    expect(screen.getByText('Content')).toBeTruthy()
  })

  it('maintains open state independently across multiple instances', () => {
    render(
      <div>
        <Collapsible label="First" defaultOpen={false}>
          <p>First content</p>
        </Collapsible>
        <Collapsible label="Second" defaultOpen={true}>
          <p>Second content</p>
        </Collapsible>
      </div>
    )

    // First should be closed
    expect(screen.queryByText('First content')).toBeNull()
    // Second should be open
    expect(screen.queryByText('Second content')).toBeTruthy()

    // Toggle First to open
    const firstLabel = screen.getByText('First')
    const firstHeader = firstLabel.closest('div')
    expect(firstHeader).toBeTruthy()
    if (firstHeader) {
      fireEvent.click(firstHeader)
    }

    // Both should now be visible
    expect(screen.queryByText('First content')).toBeTruthy()
    expect(screen.queryByText('Second content')).toBeTruthy()

    // Toggle Second to close
    const secondLabel = screen.getByText('Second')
    const secondHeader = secondLabel.closest('div')
    expect(secondHeader).toBeTruthy()
    if (secondHeader) {
      fireEvent.click(secondHeader)
    }

    // Only First should be visible
    expect(screen.queryByText('First content')).toBeTruthy()
    expect(screen.queryByText('Second content')).toBeNull()
  })

  it('renders with complex content', () => {
    render(
      <Collapsible label="Complex" defaultOpen={true}>
        <div className="space-y-[12px]">
          <div>
            <h3>Heading</h3>
            <p>Paragraph with content</p>
          </div>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </div>
      </Collapsible>
    )

    expect(screen.getByText('Heading')).toBeTruthy()
    expect(screen.getByText('Paragraph with content')).toBeTruthy()
    expect(screen.getByText('Item 1')).toBeTruthy()
    expect(screen.getByText('Item 2')).toBeTruthy()
  })

  it('Collapsible header has no box styling (regression guard)', () => {
    const { container } = render(
      <Collapsible label="Regression Check" defaultOpen={false}>
        <p>Content</p>
      </Collapsible>
    )

    // Find the wrapper div (contains the header and content)
    const wrapper = container.querySelector('div[class*="border-b"][class*="border-divider"]')
    expect(wrapper).toBeTruthy()

    // Assert that the wrapper has border-b class
    expect(wrapper?.className).toContain('border-b')
    expect(wrapper?.className).toContain('border-divider')

    // Assert no shadow-1 or bg-white classes exist in the wrapper
    expect(wrapper?.className).not.toContain('shadow-1')
    expect(wrapper?.className).not.toContain('bg-white')
  })
})
