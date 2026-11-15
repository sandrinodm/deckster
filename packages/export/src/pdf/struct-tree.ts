import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFObjectCopier,
  PDFPage,
  PDFPageLeaf,
  PDFRef,
  type PDFContext,
  type PDFDocument,
  type PDFObject,
} from 'pdf-lib';

/**
 * Roles for structure types Chromium writes that PDF 2.0 added, mapped to their PDF 1.7 equivalent
 * so readers of the document's PDF version understand them.
 */
const PDF2_ROLES: Readonly<Record<string, string>> = {
  /**
   * Strong importance, read as a span.
   */
  Strong: 'Span',

  /**
   * Emphasis, read as a span.
   */
  Em: 'Span',
};

/**
 * The structure of the merged document as it is built: the elements of each copied page and the
 * parent tree entries, renumbered so the pages' keys do not collide.
 */
export type StructureState = {
  /**
   * Whether every page copied so far was tagged; one untagged page makes the document untagged.
   */
  tagged: boolean;

  /**
   * The top-level structure element of each copied page, in page order.
   */
  sections: PDFRef[];

  /**
   * Parent tree entries: key, then the element or array of elements it maps to.
   */
  parentTree: PDFObject[];

  /**
   * The next free parent tree key.
   */
  nextKey: number;

  /**
   * Role map entries collected from the pages.
   */
  roleMap: Map<string, PDFObject>;
};

/**
 * A fresh {@link StructureState}.
 */
export function structureState(): StructureState {
  return { tagged: true, sections: [], parentTree: [], nextKey: 0, roleMap: new Map() };
}

/**
 * Copies the first page of a one-page PDF into the document with its structure (ISO 32000-1 §14.7):
 * the page, its annotations and the structure elements that point at them are copied with one
 * object copier, so every `/Pg` and `/Obj` reference lands on the copy, and the page's parent tree
 * keys (`/StructParents` on the page, `/StructParent` on annotations) are renumbered after the keys
 * of earlier pages. The page's root element becomes a `Sect` under the document's single `Document`
 * element, which {@link finishStructure} writes.
 *
 * @param document - The document the page is added to.
 * @param source - The one-page PDF Chromium printed.
 * @param state - The structure so far; updated.
 * @returns The copied page, added at the end of the document.
 */
export function copyPageWithStructure(
  document: PDFDocument,
  source: PDFDocument,
  state: StructureState,
): PDFPage | null {
  const sourcePage = source.getPages()[0];
  if (sourcePage === undefined) {
    return null;
  }

  const copier = PDFObjectCopier.for(source.context, document.context);
  const root = source.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict);
  const tops = root === undefined ? [] : topElements(source, root);
  for (const top of tops) {
    source.context.lookupMaybe(top, PDFDict)?.delete(PDFName.of('P'));
  }

  const pageRef = copier.copy(sourcePage.ref);
  const leaf = pageRef instanceof PDFRef ? document.context.lookup(pageRef) : undefined;
  if (!(pageRef instanceof PDFRef) || !(leaf instanceof PDFPageLeaf)) {
    return null;
  }

  const page = PDFPage.of(leaf, pageRef, document);
  document.addPage(page);
  if (root === undefined || tops.length === 0) {
    state.tagged = false;
    return page;
  }

  const keys = renumberKeys(root, state);
  renumberPage(leaf, keys);
  copyParentTree(root, keys, copier, state);
  const copiedTops = tops.map((top) => copier.copy(top)).filter((ref) => ref instanceof PDFRef);
  markSections(document, copiedTops);
  state.sections.push(...copiedTops);
  copyRoleMap(root, copier, state);
  return page;
}

/**
 * The number array of a structure tree root's parent tree, or `undefined` when it has none.
 *
 * @param root - The structure tree root.
 */
function parentTreeNums(root: PDFDict): PDFArray | undefined {
  return root
    .lookupMaybe(PDFName.of('ParentTree'), PDFDict)
    ?.lookupMaybe(PDFName.of('Nums'), PDFArray);
}

/**
 * Copies a page's parent tree entries under their new keys. Entries whose key the page did not
 * renumber are left out.
 *
 * @param root - The page's structure tree root.
 * @param keys - New keys by old key.
 * @param copier - The copier of the page.
 * @param state - The structure so far; its parent tree grows.
 */
function copyParentTree(
  root: PDFDict,
  keys: ReadonlyMap<number, number>,
  copier: PDFObjectCopier,
  state: StructureState,
): void {
  const nums = parentTreeNums(root);
  for (let index = 0; nums !== undefined && index + 1 < nums.size(); index += 2) {
    const key = nums.lookupMaybe(index, PDFNumber)?.asNumber();
    const mapped = key === undefined ? undefined : keys.get(key);
    if (mapped !== undefined) {
      state.parentTree.push(PDFNumber.of(mapped), copier.copy(nums.get(index + 1)));
    }
  }
}

/**
 * Turns the copied top-level elements of type `Document` into `Sect`s, because the merged document
 * has one `Document` element above them.
 *
 * @param document - The document the elements were copied into.
 * @param refs - The copied top-level elements.
 */
function markSections(document: PDFDocument, refs: readonly PDFRef[]): void {
  for (const ref of refs) {
    const element = document.context.lookupMaybe(ref, PDFDict);
    if (element?.get(PDFName.of('S')) === PDFName.of('Document')) {
      element.set(PDFName.of('S'), PDFName.of('Sect'));
    }
  }
}

/**
 * Adds a page's role map entries, copied, to the structure's role map.
 *
 * @param root - The page's structure tree root.
 * @param copier - The copier of the page.
 * @param state - The structure so far; its role map grows.
 */
function copyRoleMap(root: PDFDict, copier: PDFObjectCopier, state: StructureState): void {
  const roles = root.lookupMaybe(PDFName.of('RoleMap'), PDFDict);
  for (const [key, value] of roles?.entries() ?? []) {
    state.roleMap.set(key.asString(), copier.copy(value));
  }
}

/**
 * The references of a structure tree root's top-level elements.
 *
 * @param source - The document.
 * @param root - Its structure tree root.
 */
function topElements(source: PDFDocument, root: PDFDict): PDFRef[] {
  const kids = root.get(PDFName.of('K'));
  if (kids === undefined) {
    return [];
  }

  const list = kids instanceof PDFArray ? kids.asArray() : [kids];
  return list.filter(
    (kid): kid is PDFRef => kid instanceof PDFRef && source.context.lookup(kid) instanceof PDFDict,
  );
}

/**
 * New parent tree keys for a page's keys, after the keys already used.
 *
 * @param root - The page's structure tree root.
 * @param state - The structure so far; its next key advances.
 */
function renumberKeys(root: PDFDict, state: StructureState): Map<number, number> {
  const nums = parentTreeNums(root);
  const keys = new Map<number, number>();
  for (let index = 0; nums !== undefined && index < nums.size(); index += 2) {
    const key = nums.lookupMaybe(index, PDFNumber)?.asNumber();
    if (key !== undefined && !keys.has(key)) {
      keys.set(key, state.nextKey);
      state.nextKey += 1;
    }
  }

  return keys;
}

/**
 * Applies new parent tree keys to a copied page and its annotations.
 *
 * @param leaf - The copied page.
 * @param keys - New keys by old key.
 */
function renumberPage(leaf: PDFPageLeaf, keys: ReadonlyMap<number, number>): void {
  /**
   * Replaces one integer entry through the key map.
   */
  const remap = (dict: PDFDict, name: string): void => {
    const value = dict.lookupMaybe(PDFName.of(name), PDFNumber)?.asNumber();
    const mapped = value === undefined ? undefined : keys.get(value);
    if (mapped !== undefined) {
      dict.set(PDFName.of(name), PDFNumber.of(mapped));
    }
  };
  remap(leaf, 'StructParents');
  const annotations = leaf.lookupMaybe(PDFName.of('Annots'), PDFArray);
  for (let index = 0; annotations !== undefined && index < annotations.size(); index += 1) {
    const annotation = annotations.lookupMaybe(index, PDFDict);
    if (annotation !== undefined) {
      remap(annotation, 'StructParent');
    }
  }
}

/**
 * Writes the merged structure tree: one `Document` element holding each page's `Sect`, the parent
 * tree, the role map and `/MarkInfo`. When a page was not tagged nothing is written, since a partly
 * tagged document claims structure it does not have.
 *
 * @param document - The document.
 * @param state - The structure collected while copying pages.
 * @returns Whether the document is tagged.
 */
export function finishStructure(document: PDFDocument, state: StructureState): boolean {
  if (!state.tagged || state.sections.length === 0) {
    return false;
  }

  const { context } = document;
  const rootRef = context.nextRef();
  const documentRef = context.nextRef();
  for (const section of state.sections) {
    context.lookupMaybe(section, PDFDict)?.set(PDFName.of('P'), documentRef);
  }

  context.assign(
    documentRef,
    context.obj({
      Type: 'StructElem',
      S: 'Document',
      P: rootRef,
      K: state.sections,
    }),
  );
  const root = context.obj({
    Type: 'StructTreeRoot',
    K: documentRef,
    ParentTree: context.obj({ Nums: state.parentTree }),
    ParentTreeNextKey: PDFNumber.of(state.nextKey),
  });
  root.set(PDFName.of('RoleMap'), roleMapDictionary(context, state.roleMap));
  context.assign(rootRef, root);
  document.catalog.set(PDFName.of('StructTreeRoot'), rootRef);
  document.catalog.set(PDFName.of('MarkInfo'), context.obj({ Marked: true }));
  return true;
}

/**
 * The role map of the merged tree: the PDF 2.0 roles mapped to PDF 1.7 types first, then the roles
 * the pages declared. A page's role names carry a leading slash, which the map's keys drop.
 *
 * @param context - The document's context.
 * @param roleMap - The pages' role map entries by name with the slash.
 */
function roleMapDictionary(context: PDFContext, roleMap: ReadonlyMap<string, PDFObject>): PDFDict {
  const roles = context.obj({});
  for (const [role, standard] of Object.entries(PDF2_ROLES)) {
    roles.set(PDFName.of(role), PDFName.of(standard));
  }

  for (const [key, value] of roleMap) {
    roles.set(PDFName.of(key.slice(1)), value);
  }

  return roles;
}
