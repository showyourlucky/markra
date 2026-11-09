import {
  EditorSelection,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type DecorationSet,
} from "@codemirror/view";
import type { SearchRange } from "@markra/shared";

export interface CodeMirrorSearchState {
  readonly activeIndex: number;
  readonly decorations: DecorationSet;
  readonly matches: readonly SearchRange[];
}

interface SearchUpdate {
  activeIndex: number;
  matches: readonly SearchRange[];
}

const emptySearchState: CodeMirrorSearchState = {
  activeIndex: -1,
  decorations: Decoration.none,
  matches: [],
};
const setSearchEffect = StateEffect.define<SearchUpdate>();

function validMatches(
  matches: readonly SearchRange[],
  documentLength: number,
) {
  return matches
    .map((match, originalIndex) => ({ ...match, originalIndex }))
    .filter(
      (match) =>
        Number.isInteger(match.from) &&
        Number.isInteger(match.to) &&
        match.from >= 0 &&
        match.from < match.to &&
        match.to <= documentLength,
    )
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

function createSearchState(
  update: SearchUpdate,
  documentLength: number,
): CodeMirrorSearchState {
  const matches = validMatches(update.matches, documentLength);
  const activeIndex = matches.findIndex(
    (match) => match.originalIndex === update.activeIndex,
  );
  const decorations = Decoration.set(
    matches.map((match, index) =>
      Decoration.mark({
        class:
          index === activeIndex
            ? "cm-markra-search-match cm-markra-search-match-current"
            : "cm-markra-search-match",
      }).range(match.from, match.to),
    ),
    true,
  );

  return {
    activeIndex,
    decorations,
    matches: matches.map(({ from, to }) => ({ from, to })),
  };
}

const searchField = StateField.define<CodeMirrorSearchState>({
  create() {
    return emptySearchState;
  },
  provide(field) {
    return EditorView.decorations.from(field, (value) => value.decorations);
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSearchEffect)) {
        return createSearchState(effect.value, transaction.newDoc.length);
      }
    }
    return transaction.docChanged ? emptySearchState : value;
  },
});

const searchTheme = EditorView.baseTheme({
  ".cm-markra-search-match": {
    backgroundColor: "color-mix(in srgb, #f59e0b 32%, transparent)",
    borderRadius: "0.18em",
  },
  ".cm-markra-search-match-current": {
    backgroundColor: "color-mix(in srgb, #f59e0b 58%, transparent)",
    boxShadow: "0 0 0 1px color-mix(in srgb, #d97706 72%, transparent)",
  },
});

export function codeMirrorSearchPlugin(): Extension {
  return [searchField, searchTheme];
}

export function getCodeMirrorSearchState(
  state: EditorState,
): CodeMirrorSearchState {
  return state.field(searchField, false) ?? emptySearchState;
}

export function updateCodeMirrorSearchDecorations(
  view: EditorView,
  matches: readonly SearchRange[],
  activeIndex: number,
) {
  view.dispatch({ effects: setSearchEffect.of({ activeIndex, matches }) });
}

function validScrollMatch(
  match: SearchRange | null | undefined,
  documentLength: number,
): match is SearchRange {
  return Boolean(
    match &&
      Number.isInteger(match.from) &&
      Number.isInteger(match.to) &&
      match.from >= 0 &&
      match.from < match.to &&
      match.to <= documentLength,
  );
}

export function scrollCodeMirrorSearchMatchIntoView(
  view: EditorView,
  match: SearchRange | null | undefined,
) {
  if (!validScrollMatch(match, view.state.doc.length)) return false;

  // The visual surface scrolls through an outer container while the editor's
  // own scroller is overflow-visible, so CodeMirror cannot move the page on
  // its own: its reveal handling only reaches lines that are already
  // rendered, which is why jumping works in short documents but not long
  // ones. Set the selection like the source editor does, then scroll the
  // outer container directly from the height map, which knows every line
  // position rendered or not.
  view.dispatch({
    effects: EditorView.scrollIntoView(match.from, { y: "center" }),
    selection: EditorSelection.range(match.from, match.to),
  });
  scrollVisualSurfaceToMatch(view, match);
  return true;
}

function scrollVisualSurfaceToMatch(view: EditorView, match: SearchRange) {
  const scrollContainer = view.dom.closest<HTMLElement>(".paper-scroll");
  if (!scrollContainer) return;

  const lineBlock = view.lineBlockAt(match.from);
  const containerRect = scrollContainer.getBoundingClientRect();
  const contentTop =
    view.contentDOM.getBoundingClientRect().top -
    containerRect.top +
    scrollContainer.scrollTop;
  const targetTop =
    contentTop +
    lineBlock.top +
    lineBlock.height / 2 -
    scrollContainer.clientHeight / 2;
  scrollContainer.scrollTop = Math.max(0, targetTop);

  // Height-map positions are estimates around unmeasured block widgets.
  // Once the scrolled-to region is rendered, snap to the actual match mark,
  // the same belt-and-braces step the AI preview scroll takes.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      view.dom
        .querySelector<HTMLElement>(".cm-markra-search-match-current")
        ?.scrollIntoView?.({ block: "center", inline: "nearest" });
    });
  }
}
