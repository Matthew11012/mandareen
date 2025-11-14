import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip } from "@/components/ui/tooltip";

describe("Tooltip", () => {
  it("shows tooltip content when hovering a disabled trigger", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <Tooltip content="Monthly cap reached" delay={0}>
        <button disabled>Generate lesson</button>
      </Tooltip>,
    );

    const wrapper = container.firstChild as HTMLElement;
    await user.hover(wrapper);

    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Monthly cap reached",
    );
  });

  it("is keyboard accessible with aria-describedby semantics", async () => {
    const user = userEvent.setup();

    render(
      <Tooltip content="Helpful info" delay={0}>
        <button>Focus me</button>
      </Tooltip>,
    );

    const button = screen.getByRole("button", { name: /focus me/i });
    await user.tab(); // focus the button

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Helpful info");
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
  });
});

