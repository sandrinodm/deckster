/**
 * The file extensions the kit recognizes as images.
 */
const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

/**
 * Where the file path ends and the URL decorations begin.
 */
const QUERY_OR_FRAGMENT = /[?#]/;

/**
 * Image data URLs Vite can generate when bundling small asset imports.
 */
const EMBEDDED_IMAGE = /^data:image\/(?:avif|gif|jpeg|png|svg\+xml|webp)(?:;[^,]*)?,/i;

/**
 * Whether an MDX icon is an image file relative to the slide, for Vite to bundle.
 */
export function isRelativeIconImage(value: string): boolean {
  return (value.startsWith('./') || value.startsWith('../')) && IMAGE_EXTENSION.test(value);
}

/**
 * Whether an icon source can be loaded as an image, including bundled asset data URLs.
 */
export function isIconImage(value: string): boolean {
  if (value.startsWith('https://') || value.startsWith('http://')) {
    const url = URL.parse(value);
    if (url === null || url.username !== '' || url.password !== '') {
      return false;
    }

    return url.protocol === 'https:' || url.origin === globalThis.location?.origin;
  }

  const publicAsset =
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    IMAGE_EXTENSION.test(value.split(QUERY_OR_FRAGMENT, 1)[0] ?? '');
  return publicAsset || isRelativeIconImage(value) || EMBEDDED_IMAGE.test(value);
}
