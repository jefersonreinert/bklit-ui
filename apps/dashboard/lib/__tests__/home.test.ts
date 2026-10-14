import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addWidget,
  homeStore,
  moveDock,
  moveWidget,
  nextSize,
  removeWidget,
  resizeWidget,
  setPageIcon,
  toggleDock,
} from "../home";

const types = () => homeStore.get().widgets.map((w) => w.type);

describe("home screen layout", () => {
  it("cycles only through the sizes a widget allows", () => {
    assert.equal(nextSize({ id: "a", type: "clima", size: "s" }), "m");
    assert.equal(nextSize({ id: "a", type: "clima", size: "m" }), "s");
    assert.equal(nextSize({ id: "a", type: "vendas", size: "l" }), "m");
    assert.equal(nextSize({ id: "a", type: "escala", size: "l" }), "s");
  });

  it("adds, moves, resizes and removes widgets", () => {
    homeStore.set({ ...homeStore.get(), widgets: [] });
    addWidget("ferry");
    addWidget("pagina", "/escala");
    addWidget("clima");
    assert.deepEqual(types(), ["ferry", "pagina", "clima"]);
    assert.equal(homeStore.get().widgets[1]?.href, "/escala");

    const [first, , last] = homeStore.get().widgets;
    moveWidget(last?.id ?? "", -1);
    assert.deepEqual(types(), ["ferry", "clima", "pagina"]);
    moveWidget(first?.id ?? "", -1); // already first: no change
    assert.deepEqual(types(), ["ferry", "clima", "pagina"]);

    resizeWidget(first?.id ?? "");
    assert.equal(homeStore.get().widgets[0]?.size, "l");

    removeWidget(first?.id ?? "");
    assert.deepEqual(types(), ["clima", "pagina"]);
  });

  it("puts pages in and out of the dock", () => {
    homeStore.set({ ...homeStore.get(), dock: ["/pos"] });
    toggleDock("/ferry");
    toggleDock("/pos");
    assert.deepEqual(homeStore.get().dock, ["/ferry"]);
    toggleDock("/pos");
    moveDock("/pos", -1);
    assert.deepEqual(homeStore.get().dock, ["/pos", "/ferry"]);
  });

  it("keeps a custom icon per page until it is removed", () => {
    setPageIcon("/pos", "data:image/png;base64,AAAA");
    assert.equal(homeStore.get().icons["/pos"], "data:image/png;base64,AAAA");
    setPageIcon("/pos", null);
    assert.equal(homeStore.get().icons["/pos"], undefined);
  });
});
