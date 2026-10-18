import { jest } from "@jest/globals";
import { undo } from "../../src/plugins/undo.js";

test("undo.commit inside an effect warns once and still runs the command", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    window.clay = { effect: { running: false } };
    undo.commit("Outside", () => {});
    expect(warn).not.toHaveBeenCalled();

    window.clay.effect.running = true;
    const fn = jest.fn();
    undo.commit("Inside", fn);
    undo.commit("Again", () => {});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('undo.commit("Inside")');
    expect(fn).toHaveBeenCalledTimes(0);
  } finally {
    warn.mockRestore();
    window.clay = undefined;
  }
});
