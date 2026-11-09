import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  codeMirrorSearchPlugin,
  getCodeMirrorSearchState,
  scrollCodeMirrorSearchMatchIntoView,
  updateCodeMirrorSearchDecorations,
} from "./search.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];

function createView(doc = "Alpha beta Alpha") {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [codeMirrorSearchPlugin()],
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("CodeMirror search decorations", () => {
  it("renders matches and distinguishes the active result", () => {
    const view = createView();

    updateCodeMirrorSearchDecorations(
      view,
      [
        { from: 0, to: 5 },
        { from: 11, to: 16 },
      ],
      1,
    );

    expect(view.dom.querySelectorAll(".cm-markra-search-match")).toHaveLength(2);
    expect(
      view.dom.querySelector(".cm-markra-search-match-current")?.textContent,
    ).toBe("Alpha");
    expect(getCodeMirrorSearchState(view.state)).toMatchObject({
      activeIndex: 1,
      matches: [
        { from: 0, to: 5 },
        { from: 11, to: 16 },
      ],
    });
  });

  it("drops invalid ranges and clears stale results after document edits", () => {
    const view = createView();

    updateCodeMirrorSearchDecorations(
      view,
      [
        { from: -1, to: 2 },
        { from: 0, to: 5 },
        { from: 99, to: 100 },
      ],
      0,
    );
    expect(getCodeMirrorSearchState(view.state).matches).toEqual([
      { from: 0, to: 5 },
    ]);

    view.dispatch({ changes: { from: 0, insert: "!" } });
    expect(getCodeMirrorSearchState(view.state).matches).toEqual([]);
    expect(view.dom.querySelector(".cm-markra-search-match")).toBeNull();
  });

  it("requests scrolling only for a valid match", () => {
    const view = createView();

    expect(scrollCodeMirrorSearchMatchIntoView(view, { from: 11, to: 16 })).toBe(
      true,
    );
    expect(scrollCodeMirrorSearchMatchIntoView(view, { from: 20, to: 30 })).toBe(
      false,
    );
  });

  it("scrolls the outer paper container from the height map", () => {
    const container = document.createElement("div");
    container.className = "paper-scroll";
    document.body.append(container);
    const parent = document.createElement("div");
    container.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "Alpha beta Alpha",
        extensions: [codeMirrorSearchPlugin()],
      }),
    });
    views.push(view);

    Object.defineProperty(container, "clientHeight", { value: 100 });
    container.getBoundingClientRect = () => new DOMRect(0, 0, 0, 100);
    view.contentDOM.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
    const lineBlockAt = view.lineBlockAt.bind(view);
    view.lineBlockAt = (pos: number) => ({
      ...lineBlockAt(pos),
      bottom: 520,
      height: 20,
      top: 500,
    });

    expect(scrollCodeMirrorSearchMatchIntoView(view, { from: 11, to: 16 })).toBe(
      true,
    );
    expect(container.scrollTop).toBe(460);
  });

  it("moves the selection to the revealed match", () => {
    const view = createView();

    expect(scrollCodeMirrorSearchMatchIntoView(view, { from: 11, to: 16 })).toBe(
      true,
    );
    expect(view.state.selection.main.from).toBe(11);
    expect(view.state.selection.main.to).toBe(16);

    expect(scrollCodeMirrorSearchMatchIntoView(view, { from: 20, to: 30 })).toBe(
      false,
    );
    expect(view.state.selection.main.from).toBe(11);
    expect(view.state.selection.main.to).toBe(16);
  });
});
