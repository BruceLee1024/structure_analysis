#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_INPUT_PATH = '/Users/luckyzaizai/Downloads/朱慈勉结构力学上册（第三版）.pdf_by_PaddleOCR-VL-1.5.json';
const DEFAULT_OUTPUT_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../data/geometry-figure-sources.chapter2.json',
);
const MIN_IMAGE_AREA = 10_000;

function normalizePath(maybeFileUrlPath) {
  return decodeURIComponent(maybeFileUrlPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function extractImageSource(blockContent) {
  const match = blockContent.match(/src="([^"]+)"/);
  return match?.[1] ?? null;
}

function extractWidthPercent(blockContent) {
  const match = blockContent.match(/width="(\d+)%"?/);
  return match ? Number(match[1]) : null;
}

function extractFigureId(blockContent) {
  const match = blockContent.match(/图\s*2[\-−](\d+)/);
  return match ? `2-${Number(match[1])}` : null;
}

function extractPanelLabel(blockContent) {
  const match = blockContent.match(/\(([a-z])\)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function makeCenter(bbox) {
  return {
    x: (bbox[0] + bbox[2]) / 2,
    y: (bbox[1] + bbox[3]) / 2,
  };
}

function makeImageBlock(block, markdownImages) {
  const bbox = block.block_bbox;
  const width = bbox[2] - bbox[0];
  const height = bbox[3] - bbox[1];
  const sourcePath = extractImageSource(block.block_content ?? '');

  return {
    blockId: block.block_id,
    bbox,
    polygon: block.block_polygon_points ?? null,
    width,
    height,
    area: width * height,
    center: makeCenter(bbox),
    sourcePath,
    sourceUrl: sourcePath ? markdownImages[sourcePath] ?? null : null,
    widthPercentHint: extractWidthPercent(block.block_content ?? ''),
  };
}

function makeFigureTitleBlock(block) {
  return {
    blockId: block.block_id,
    bbox: block.block_bbox,
    polygon: block.block_polygon_points ?? null,
    center: makeCenter(block.block_bbox),
    figureId: extractFigureId(block.block_content ?? ''),
    rawHtml: block.block_content ?? '',
  };
}

function makePanelLabelBlock(block) {
  return {
    blockId: block.block_id,
    bbox: block.block_bbox,
    polygon: block.block_polygon_points ?? null,
    center: makeCenter(block.block_bbox),
    label: extractPanelLabel(block.block_content ?? ''),
    rawHtml: block.block_content ?? '',
  };
}

function imageAssociationScore(image, figureTitle) {
  const verticalGap = Math.max(0, figureTitle.bbox[1] - image.bbox[3]);
  const horizontalGap = Math.abs(figureTitle.center.x - image.center.x);
  return verticalGap * 10 + horizontalGap;
}

function panelAssociationScore(label, image) {
  if (image.center.y + 10 < label.center.y) return Number.POSITIVE_INFINITY;
  const verticalGap = Math.max(0, image.center.y - label.center.y);
  const horizontalGap = Math.abs(image.center.x - label.center.x);
  return verticalGap * 10 + horizontalGap;
}

function sortByVisualFlow(a, b) {
  const yDiff = a.bbox[1] - b.bbox[1];
  if (Math.abs(yDiff) > 24) return yDiff;
  const xDiff = a.bbox[0] - b.bbox[0];
  if (Math.abs(xDiff) > 0) return xDiff;
  return (a.blockId ?? 0) - (b.blockId ?? 0);
}

function extractFiguresFromPage(page, pageIndex) {
  const markdown = page.markdown ?? {};
  const markdownImages = markdown.images ?? {};
  const blocks = page?.prunedResult?.parsing_res_list ?? [];

  const images = [];
  const panelLabels = [];
  const figureTitles = [];

  for (const block of blocks) {
    if (!block?.block_bbox || !block?.block_label) continue;

    if (block.block_label === 'image') {
      const image = makeImageBlock(block, markdownImages);
      if (image.area >= MIN_IMAGE_AREA) {
        images.push(image);
      }
      continue;
    }

    if (block.block_label === 'figure_title') {
      const figureId = extractFigureId(block.block_content ?? '');
      if (figureId) {
        figureTitles.push(makeFigureTitleBlock(block));
        continue;
      }

      const panelLabel = extractPanelLabel(block.block_content ?? '');
      if (panelLabel) {
        panelLabels.push(makePanelLabelBlock(block));
      }
    }
  }

  if (!figureTitles.length) return [];

  const pageFigures = figureTitles
    .filter((item) => /^2-\d+$/.test(item.figureId))
    .sort(sortByVisualFlow);

  const groupedImages = new Map(pageFigures.map((item) => [item.figureId, []]));

  for (const image of images) {
    let bestFigure = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const figure of pageFigures) {
      if (figure.center.y < image.center.y - 5) continue;
      const score = imageAssociationScore(image, figure);
      if (score < bestScore) {
        bestScore = score;
        bestFigure = figure;
      }
    }

    if (!bestFigure) {
      for (const figure of pageFigures) {
        const score = imageAssociationScore(image, figure);
        if (score < bestScore) {
          bestScore = score;
          bestFigure = figure;
        }
      }
    }

    if (bestFigure) {
      groupedImages.get(bestFigure.figureId)?.push({
        ...image,
      });
    }
  }

  const flatImages = [...groupedImages.values()].flat();
  for (const label of panelLabels) {
    let bestImage = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const image of flatImages) {
      const score = panelAssociationScore(label, image);
      if (score < bestScore) {
        bestScore = score;
        bestImage = image;
      }
    }

    if (bestImage && Number.isFinite(bestScore)) {
      bestImage.subfigureLabelGuess = label.label;
      bestImage.subfigureLabelScore = bestScore;
    }
  }

  return pageFigures.map((figure, indexOnPage) => {
    const imagesForFigure = (groupedImages.get(figure.figureId) ?? []).sort(sortByVisualFlow);

    return {
      figureId: figure.figureId,
      pageIndex,
      indexOnPage,
      titleBlock: {
        blockId: figure.blockId,
        bbox: figure.bbox,
        polygon: figure.polygon,
        rawHtml: figure.rawHtml,
      },
      pageImage: {
        inputImageUrl: page.inputImage ?? null,
        layoutDetectionUrl: page.outputImages?.layout_det_res ?? null,
      },
      images: imagesForFigure.map((image) => ({
        blockId: image.blockId,
        bbox: image.bbox,
        polygon: image.polygon,
        sourcePath: image.sourcePath,
        sourceUrl: image.sourceUrl,
        widthPercentHint: image.widthPercentHint,
        subfigureLabelGuess: image.subfigureLabelGuess ?? null,
        subfigureLabelScore: image.subfigureLabelScore ?? null,
      })),
    };
  });
}

function buildChapter2Source(doc, sourceJsonPath) {
  const figures = [];

  doc.forEach((page, pageIndex) => {
    figures.push(...extractFiguresFromPage(page, pageIndex));
  });

  const chapter2Figures = figures
    .filter((item) => {
      const n = Number(item.figureId.split('-')[1]);
      return Number.isFinite(n) && n >= 1 && n <= 21;
    })
    .sort((a, b) => {
      const na = Number(a.figureId.split('-')[1]);
      const nb = Number(b.figureId.split('-')[1]);
      if (na !== nb) return na - nb;
      return a.pageIndex - b.pageIndex;
    });

  return {
    generatedAt: new Date().toISOString(),
    sourceJsonPath,
    chapter: 2,
    minImageArea: MIN_IMAGE_AREA,
    figureCount: chapter2Figures.length,
    figures: chapter2Figures,
  };
}

function main() {
  const inputPath = normalizePath(process.argv[2] || DEFAULT_INPUT_PATH);
  const outputPath = normalizePath(process.argv[3] || DEFAULT_OUTPUT_PATH);

  const doc = readJson(inputPath);
  const result = buildChapter2Source(doc, inputPath);

  ensureDir(outputPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`Extracted ${result.figureCount} chapter-2 figures.`);
  console.log(`Output: ${outputPath}`);
}

main();
