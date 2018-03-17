// @flow

import DepthMode from '../gl/depth_mode';
import {
    lineUniformValues,
    linePatternUniformValues,
    lineSDFUniformValues
} from './program/line_program';

import type Painter from './painter';
import type SourceCache from '../source/source_cache';
import type LineStyleLayer from '../style/style_layer/line_style_layer';
import type LineBucket from '../data/bucket/line_bucket';
import type {OverscaledTileID} from '../source/tile_id';

export default function drawLine(painter: Painter, sourceCache: SourceCache, layer: LineStyleLayer, coords: Array<OverscaledTileID>) {
    if (painter.renderPass !== 'translucent') return;

    const opacity = layer.paint.get('line-opacity');
    if (opacity.constantOr(1) === 0) return;

    const depthMode = painter.depthModeForSublayer(0, DepthMode.ReadOnly);
    const colorMode = painter.colorModeForRenderPass();

    const programId =
        layer.paint.get('line-dasharray') ? 'lineSDF' :
        layer.paint.get('line-pattern') ? 'linePattern' : 'line';

    let firstTile = true;

    for (const coord of coords) {
        const tile = sourceCache.getTile(coord);
        const bucket: ?LineBucket = (tile.getBucket(layer): any);
        if (!bucket) continue;

        const programConfiguration = bucket.programConfigurations.get(layer.id);
        const prevProgram = painter.context.program.get();
        const program = painter.useProgram(programId, programConfiguration);
        const programChanged = firstTile || program.program !== prevProgram;

        drawLineTile(program, painter, tile, bucket, layer, coord, depthMode, colorMode, programConfiguration, programChanged);
        firstTile = false;
        // once refactored so that bound texture state is managed, we'll also be able to remove this firstTile/programChanged logic
    }
}

function drawLineTile(program, painter, tile, bucket, layer, coord, depthMode, colorMode, programConfiguration, programChanged) {
    const context = painter.context;
    const gl = context.gl;
    const dasharray = layer.paint.get('line-dasharray');
    const image = layer.paint.get('line-pattern');

    if (painter.isPatternMissing(image)) return;

    if (programChanged) {
        if (dasharray) {
            context.activeTexture.set(gl.TEXTURE0);
            painter.lineAtlas.bind(context);
        } else if (image) {
            context.activeTexture.set(gl.TEXTURE0);
            painter.imageManager.bind(context);
        }
    }

    const uniformValues = dasharray ? lineSDFUniformValues(painter, tile, layer, dasharray) :
        image ? linePatternUniformValues(painter, tile, layer, image) :
        lineUniformValues(painter, tile, layer);

    program.draw(context, gl.TRIANGLES, depthMode,
        painter.stencilModeForClipping(coord), colorMode, uniformValues,
        layer.id, bucket.layoutVertexBuffer, bucket.indexBuffer, bucket.segments,
        layer.paint, painter.transform.zoom, programConfiguration);
}
