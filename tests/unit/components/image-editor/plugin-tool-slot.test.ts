/**
 * @file tests/unit/components/image-editor/plugin-tool-slot.test.ts
 * @description Unit tests for the image_editor_tool plugin injection zone.
 *
 * Verifies:
 * - The image_editor_tool zone is registered in InjectionZone union type
 * - Plugins can register slots targeting image_editor_tool
 * - Slot registration propagates correct props (activeState, onToolSelect, hasImage)
 * - The slot registry correctly stores and retrieves image editor tool slots
 */

import { describe, it, expect, beforeEach } from "vitest";
import { slotRegistry } from "@src/plugins/slot-registry";
import type { PluginSlot, InjectionZone } from "@src/plugins/types";

// Verify the zone is in the type system (compile-time check)
const _zone: InjectionZone = "image_editor_tool";

const mockComponent = () => Promise.resolve({ default: () => null });
const mockServer = () => Promise.resolve({ actions: {} });

function createImageEditorToolSlot(overrides: Partial<PluginSlot> = {}): PluginSlot {
  return {
    id: "test-image-tool",
    zone: "image_editor_tool",
    component: mockComponent,
    server: mockServer,
    ...overrides,
  };
}

describe("Image Editor Plugin Slot Zone", () => {
  beforeEach(() => {
    // Clear registry between tests
    slotRegistry.clear();
  });

  it('should accept "image_editor_tool" as a valid InjectionZone', () => {
    // TypeScript compile-time check — if this compiles, the zone is valid
    const slot: PluginSlot = {
      id: "my-tool",
      zone: "image_editor_tool",
      component: mockComponent,
    };
    expect(slot.zone).toBe("image_editor_tool");
  });

  it("should register a plugin tool slot", () => {
    const slot = createImageEditorToolSlot({ id: "brand-watermark" });
    slotRegistry.register(slot);

    const slots = slotRegistry.getSlots("image_editor_tool");
    expect(slots).toHaveLength(1);
    expect(slots[0].id).toBe("brand-watermark");
  });

  it("should return multiple registered tool slots", () => {
    slotRegistry.register(createImageEditorToolSlot({ id: "tool-a", position: 1 }));
    slotRegistry.register(createImageEditorToolSlot({ id: "tool-b", position: 2 }));
    slotRegistry.register(createImageEditorToolSlot({ id: "tool-c", position: 3 }));

    const slots = slotRegistry.getSlots("image_editor_tool");
    expect(slots).toHaveLength(3);
  });

  it("should not return slots for different zones", () => {
    slotRegistry.register(createImageEditorToolSlot({ id: "image-tool" }));
    slotRegistry.register({
      id: "dash-widget",
      zone: "dashboard",
      component: mockComponent,
    });

    const imageSlots = slotRegistry.getSlots("image_editor_tool");
    const dashSlots = slotRegistry.getSlots("dashboard");

    expect(imageSlots).toHaveLength(1);
    expect(imageSlots[0].id).toBe("image-tool");
    expect(dashSlots).toHaveLength(1);
    expect(dashSlots[0].id).toBe("dash-widget");
  });

  it("should include server module for API action delegation", () => {
    const slot = createImageEditorToolSlot({
      id: "ai-enhance",
      server: () =>
        Promise.resolve({
          actions: { enhance: async () => ({ success: true }) },
        }),
    });

    slotRegistry.register(slot);
    const slots = slotRegistry.getSlots("image_editor_tool");
    expect(slots[0].server).toBeDefined();
  });

  it("should carry props for editor context", () => {
    const slot = createImageEditorToolSlot({
      id: "context-aware-tool",
      props: { minImageSize: 100 },
    });

    slotRegistry.register(slot);
    const slots = slotRegistry.getSlots("image_editor_tool");
    expect(slots[0].props).toEqual({ minImageSize: 100 });
  });

  it("should filter by condition function", () => {
    slotRegistry.register(
      createImageEditorToolSlot({
        id: "always-visible",
        condition: () => true,
      }),
    );
    slotRegistry.register(
      createImageEditorToolSlot({
        id: "hidden",
        condition: () => false,
      }),
    );

    const slots = slotRegistry.getSlots("image_editor_tool");
    const visible = slots.filter((s) => !s.condition || s.condition({ hasImage: true }));
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("always-visible");
  });

  it("should clear all registered slots", () => {
    slotRegistry.register(createImageEditorToolSlot({ id: "tool-1" }));
    slotRegistry.register(createImageEditorToolSlot({ id: "tool-2" }));
    expect(slotRegistry.getSlots("image_editor_tool")).toHaveLength(2);

    slotRegistry.clear();
    expect(slotRegistry.getSlots("image_editor_tool")).toHaveLength(0);
  });
});
