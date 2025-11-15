/**
 * 从 URL 字符串中获取 URL 路径的最后一段。
 *
 * @param {string} urlString 要解析的 URL 字符串。
 * @returns {string|null} URL 路径的最后一段，如果路径为空则返回空字符串，如果 URL 无效则返回 null。
 */
function getLastUrlPathSegment(url) {
  try {
    let pathname = url.pathname; // 例如: "/a/b/c", "/a/b/c/", "/file.txt", "/"
    
    // 移除路径末尾的斜杠，使其标准化，方便后续分割
    // 例如: "/a/b/c/" -> "/a/b/c"
    //       "/"     -> ""
    if (pathname.endsWith('/')) {
      pathname = pathname.substring(0, pathname.length - 1);
    }
    
    // 如果路径为空（例如，原始URL是 "http://example.com" 或 "http://example.com/"），
    // 或者只剩下根路径 "/" 经过处理后变为空，则返回空字符串。
    if (pathname === '' || pathname === '/') {
      return '';
    }
    
    // 分割路径，并获取最后一段
    const segments = pathname.split('/');
    return segments[segments.length - 1];
    
  } catch (error) {
    // 处理无效 URL 字符串的情况
    console.error("无效的 URL 字符串:", urlString, error);
    return null;
  }
}
