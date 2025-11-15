import { Video } from '@renmu/bili-api';

const BVID_REGEX = /\/(BV\w{10})/;
const AID_REGEX = /\/av(\d+)/;
const REFERER_HEADER = 'https://www.bilibili.com';
const FILE_EXTENSIONS = {
  video: 'mp4',
  audio: 'm4a',
};

const PLUGIN_IDENTITY_LABEL = gopeed.info.identity;

/**
 * 从 URL 中提取 BVID 或 AID。
 * @param {URL} url
 * @returns {{bvid: string}|{aid: string}|null}
 */
function getVideoId(url) {
  let match = url.pathname.match(BVID_REGEX);
  if (match && match[1]) {
    return { bvid: match[1] };
  }
  match = url.pathname.match(AID_REGEX);
  if (match && match[1]) {
    return { aid: match[1] };
  }
  return null;
}

/**
 * 解析分P参数，返回 0-indexed 的分P列表。
 * @param {string|null} pParam URL 中的 'p' 参数值。
 * @param {number} totalPages 视频的总分P数。
 * @returns {number[]} 0-indexed 的分P数组。
 */
function parsePartRange(pParam, totalPages) {
  if (!pParam) {
    return Array.from({ length: totalPages }, (_, i) => i); // 默认下载所有分P
  }

  const parts = [];
  const arr = pParam.split('-');

  if (arr.length > 1) {
    let start = parseInt(arr[0]) || 1;
    let end = parseInt(arr[1]) || totalPages;

    // 确保 start 和 end 在有效范围内 (1 到 totalPages)
    start = Math.max(1, Math.min(start, totalPages));
    end = Math.max(1, Math.min(end, totalPages));

    // 确保 start <= end，例如处理 p=5-1 的情况
    if (start > end) {
      [start, end] = [end, start];
    }

    for (let i = start; i <= end; i++) {
      parts.push(i - 1); // 转换为 0-indexed
    }
  } else {
    const singlePart = parseInt(pParam);
    if (!isNaN(singlePart) && singlePart >= 1 && singlePart <= totalPages) {
      parts.push(singlePart - 1); // 转换为 0-indexed
    }
  }
  return parts;
}

gopeed.events.onResolve(async (ctx) => {
  const url = new URL(ctx.req.url);
  const videoId = getVideoId(url);
  if (!videoId) {
    gopeed.logger.debug(`无法从 URL ${ctx.req.url} 中提取 BVID 或 AID。`);
    return;
  }

  const video = new Video({ cookie: gopeed.settings.cookie?.trim() || undefined }, true);
  const data = await video.detail(videoId);
  const pages = data.View?.pages || []

  const isMultiPart = data.pages.length > 1;
  const partsToDownload = parsePartRange(url.searchParams.get('p'), pages.length);
  if (partsToDownload.length === 0) {
    gopeed.logger.warn(`根据参数 'p' (值: ${url.searchParams.get('p')}) 未找到有效的下载分P。`);
    return;
  }

  const files = partsToDownload.flatMap((pIndex) => {
    const pageInfo = pages[pIndex];
    const pageName = isMultiPart ? `[P${pIndex + 1}][${pageInfo.part}]` : '';
    const fileName = `[Bilibili][${data.title}]${pageName}`;
    
    const fileReqInfo = {
      extra: { header: { Referer: REFERER_HEADER } },
      labels: {
        [PLUGIN_IDENTITY_LABEL]: '1',
        bvid: data.View.bvid,
        cid: pageInfo.cid,
        stm: gopeed.settings.stm,
        p: pIndex,
        type: 'video',
        quality: media.quality,
      }
    };
    if (gopeed.settings.stm == "mp4") {
      const media = await video.playurl({
        bvid: bvid,
        cid: cid,
        fnval: 1,
        platform: "html5",
        high_quality: 1,
        qn: gopeed.settings.videoQuality,
      });
      fileReqInfo.url = media.durl[0];
      return [{
        name: `${fileName}[${media.format}].mp4`,
        req: fileReqInfo,
      }];
    }
    
    const dash = getDashStreamInfo(data.View.bvid, pageInfo.cid)
    return Object.entries(FILE_EXTENSIONS).map(([type, ext]) => {
      fileReqInfo.url = type === "video" ? dash.videoUrl : dash.audioUrl;
      fileReqInfo.labels.stm = "dash";
      fileReqInfo.labels.type = type;
      return {
        name: `${fileName}[${media.format}][${type}].${ext}`,
        req: fileReqInfo,
      }
    });
  });

  ctx.res = {
    name: data.title,
    files: files,
  };
});

/** @param { import('gopeed').OnStartContext } ctx */
gopeed.events.onStart(async (ctx) => {
  await updateDownloadUrl(ctx.task);
});

/** @param { import('gopeed').OnErrorContext } ctx */
gopeed.events.onError(async (ctx) => {
  gopeed.logger.warn(`任务 ${ctx.task.name} 发生错误，尝试更新下载链接。`);
  await updateDownloadUrl(ctx.task);
  ctx.task.continue(); // 继续任务，让 Gopeed 尝试重新下载
});

async function updateDownloadUrl(task) {
  if (labels.stm === "mp4") {
    const mp4 = getMp4StreamInfo(labels.bvid, labels.cid);
    if (mp4) {
      req.url = mp4.url;
      return;
    }
  }
  
  const dash = getDashStreamInfo(labels.bvid, labels.cid);
  req.url = labels.type === "video" ? dash.videoUrl : dash.audioUrl;
}

async function getMp4StreamInfo(bvid, cid) {
  const video = new ({ cookie: gopeed.settings.cookie?.trim() || undefined }, true);
  const media = await video.playurl({
    bvid: bvid,
    cid: cid,
    fnval: 1,
    platform: "html5",
    high_quality: 1,
    qn: gopeed.settings.videoQuality,
  });
  
  return { url: media.durl[0]?.url };
}

async function getDashStreamInfo(bvid, cid) {
  const video = new Video({ cookie: gopeed.settings.cookie?.trim() || undefined }, true);
  const media = await video.playurl({
    bvid,
    cid,
    fnval: 16 | 4048,
  });
  
  let videos = (media.dash.video || [])
  if (gopeed.settings.videoCodec !== "0") {
    videos = videos.filter(video => {
      gopeed.settings.videoCodec === mediaOptions.videoCodec;
    });
  }
  const video = findObjectByIdOrClosestSmaller(videos, gopeed.settings.videoQuality);


  let audios = media.dash.audio || [];
  if (media.dash?.dolby?.audio) {
    audios.unshift(...media.dash.dolby.audio);
  }
  if (media.dash?.flac?.audio) {
    audios.unshift(...media.dash.flac.audio);
  }
  
  const audio = findObjectByIdOrClosestSmaller(audios, gopeed.settings.audioQuality);
  return {
    videoUrl: video.baseUrl,
    audioUrl: audio.baseUrl,
    videoQuality: video.id,
    audioQuality: audio.id,
  };
}

function findObjectByIdOrClosestSmaller(arr, targetId) {
  let closestSmaller = null;
  
  for (const obj of arr) {
    if (obj.id === targetId) return obj;
    
    if (obj.id < targetId) {
      if (closestSmaller === null || obj.id > closestSmaller.id) {
        closestSmaller = obj;
      }
    }
  }
  
  return closestSmaller;
}
