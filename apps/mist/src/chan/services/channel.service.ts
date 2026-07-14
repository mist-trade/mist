import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { minMaxBy } from '@app/utils';
import { ERROR_MESSAGES } from '@app/constants';
import { CreateChannelDto } from '../dto/create-channel.dto';
import {
  ChannelLevel,
  ChannelStatus,
  ChannelType,
} from '../enums/channel.enum';
import { BiVo } from '../vo/bi.vo';
import { ChannelVo } from '../vo/channel.vo';
import { mergeSpans } from './span-merge.helper';

/**
 * 两阶段合并结果：
 * - phaseA: 固定5笔滑窗枚举的所有基础中枢（valid + invalid 残留混合）
 * - phaseB: 定点迭代合并后的最终中枢序列（消化 invalid 残留后的干净序列）
 * 前端叠加渲染：phaseA 淡色，phaseB 实色。
 */
export interface ChannelTwoPhaseResult {
  phaseA: ChannelVo[];
  phaseB: ChannelVo[];
}

@Injectable()
export class ChannelService {
  // 画中枢
  /**
   * 主函数：识别中枢（两阶段算法：Phase A 5笔滑窗枚举 + Phase B 定点迭代合并）
   *
   * 算法流程：
   * 1. Phase A：以固定5笔滑窗枚举所有基础中枢（趋势交替 + zg>zd + 第4/5笔重叠），
   *            每个起点都尝试，成功后步进1，枚举出所有可能的基础中枢（含重叠/相邻）
   * 2. Phase B：对 Phase A 输出做定点迭代合并（短跨度优先 + 最左优先），
   *            把时间重叠且 zone 兼容的同向中枢合并成大中枢
   *
   * 核心优势：
   * - 镜像笔的两阶段架构（Phase A 局部枚举 + Phase B 全局合并），结构一致易维护
   * - Phase A 枚举所有候选，不漏；Phase B 合并冗余，不重
   * - Phase A 保留通过基础重叠检查的候选，再用范围与极值规则标记 Valid/Invalid
   *
   * @param createChannelDto 包含笔数据的 DTO（用 Phase B 笔序列）
   * @returns 两阶段中枢结果 { phaseA, phaseB }
   */
  createChannel(createChannelDto: CreateChannelDto): ChannelTwoPhaseResult {
    this.validateInput(createChannelDto);
    this.validateBiIntegrity(createChannelDto.bi);
    return this.getChannel(createChannelDto.bi);
  }

  private validateInput(createChannelDto: CreateChannelDto): void {
    if (!createChannelDto || !createChannelDto.bi) {
      throw new HttpException(
        ERROR_MESSAGES.BI_DATA_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!Array.isArray(createChannelDto.bi)) {
      throw new HttpException(
        ERROR_MESSAGES.BI_MUST_BE_ARRAY,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (createChannelDto.bi.length === 0) {
      throw new HttpException(
        ERROR_MESSAGES.BI_ARRAY_EMPTY,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 校验每笔都有必需字段
    for (let i = 0; i < createChannelDto.bi.length; i++) {
      const bi = createChannelDto.bi[i];
      if (!bi.highest || !bi.lowest) {
        throw new HttpException(
          ERROR_MESSAGES.BI_MISSING_HIGH_LOW.replace('{{index}}', String(i)),
          HttpStatus.BAD_REQUEST,
        );
      }
      if (typeof bi.highest !== 'number' || typeof bi.lowest !== 'number') {
        throw new HttpException(
          ERROR_MESSAGES.BI_INVALID_NUMBER_TYPE.replace('{{index}}', String(i)),
          HttpStatus.BAD_REQUEST,
        );
      }
      if (bi.highest <= bi.lowest) {
        throw new HttpException(
          ERROR_MESSAGES.BI_HIGH_MUST_EXCEED_LOW.replace(
            '{{index}}',
            String(i),
          ),
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  private validateBiIntegrity(bis: BiVo[]): void {
    for (let i = 0; i < bis.length; i++) {
      const bi = bis[i];
      const isLastBi = i === bis.length - 1;

      // 最后一笔可以是未完成的（endFenxing 为 null）
      if (isLastBi && !bi.endFenxing) {
        continue;
      }

      // 其他笔必须有完整的 startFenxing 和 endFenxing
      if (!bi.startFenxing || !bi.endFenxing) {
        throw new HttpException(
          ERROR_MESSAGES.BI_MISSING_FENXING.replace('{{index}}', String(i + 1)),
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  /**
   * 获取中枢（两阶段：Phase A 枚举 + Phase B 合并）
   * @param data 笔数组
   * @returns 两阶段中枢结果
   */
  private getChannel(data: BiVo[]): ChannelTwoPhaseResult {
    // Phase A：固定5笔滑窗枚举所有基础中枢
    const phaseA = this.enumerateChannels(data);

    // Phase B：定点迭代合并
    const phaseB = this.mergeChannels(phaseA);

    return { phaseA, phaseB };
  }

  /**
   * Phase A：固定5笔滑窗枚举所有基础中枢。
   *
   * 每个起点 i 都尝试识别一个固定五笔基础中枢，成功后 i += 1，
   * 枚举出所有可能的基础中枢（含重叠/相邻），作为 Phase B 合并的原料。
   * 每个中枢印 status: Valid|Invalid，Phase B 只消化含 Invalid 的 span。
   *
   * @param data 笔数组
   * @returns Phase A 枚举出的所有基础中枢
   */
  private enumerateChannels(data: BiVo[]): ChannelVo[] {
    const channels: ChannelVo[] = [];
    const biCount = data.length;

    if (biCount < 5) {
      return channels;
    }

    let i = 0;
    while (i <= biCount - 5) {
      const channel = this.detectChannel(data.slice(i, i + 5), data, i);

      if (!channel) {
        i++;
        continue;
      }

      // 基础重叠由 detectChannel 保证；范围与极值规则决定最终 status。
      const stamped: ChannelVo = {
        ...channel,
        status: this.isCandidateChannelValid(channel)
          ? ChannelStatus.Valid
          : ChannelStatus.Invalid,
      };

      channels.push(stamped);
      // 每个起点都尝试，步进1枚举所有重叠/相邻候选中枢
      i++;
    }

    return channels;
  }

  /**
   * Phase B：定点迭代合并，镜像笔的 mergeBiSegments。
   *
   * 合并驱动由共享的 {@link mergeSpans} 提供，中枢领域谓词（完成态/同向/
   * zone 兼容/envelope/mergeTwoChannels/重新判状态）通过 operations 注入。
   *
   * @param phaseAChannels Phase A 枚举出的基础中枢
   * @returns 合并到不动点后的最终中枢序列
   */
  private mergeChannels(phaseAChannels: readonly ChannelVo[]): ChannelVo[] {
    const merged = mergeSpans(phaseAChannels, {
      isCompleteItem: (channel) => channel.type === ChannelType.Complete,
      isSameDirection: (head, tail) => head.trend === tail.trend,
      spanHasInvalid: (span) =>
        span.some((channel) => channel.status === ChannelStatus.Invalid),
      canMergeTwo: (head, tail) => this.canMergeTwoChannels(head, tail),
      middleFitsEnvelope: (span) => this.middleChannelsFitEnvelope(span),
      mergeTwo: (head, tail) => this.mergeTwoChannels(head, tail),
      stampStatus: (merged) => ({
        ...merged,
        status: this.isCandidateChannelValid(merged)
          ? ChannelStatus.Valid
          : ChannelStatus.Invalid,
      }),
    });

    return merged.filter((channel) => channel.status === ChannelStatus.Valid);
  }

  /**
   * 验证候选中枢是否有效（标准缠论定义）。
   *
   * 中枢成立只看 zg > zd（3 段重叠）+ 至少 3 笔，不附加极值/范围强校验。
   * 极值关系只在延伸(extendChannel)和后续走势判断里用，不影响中枢是否成立。
   * @param channel 候选中枢
   * @returns 是否有效
   */
  private isCandidateChannelValid(channel: ChannelVo): boolean {
    return channel.bis.length >= 3 && channel.zg > channel.zd;
  }

  /**
   * 验证笔的趋势是否交替
   */
  private validateTrendAlternating(bis: BiVo[]): boolean {
    for (let i = 0; i < bis.length - 1; i++) {
      if (bis[i].trend === bis[i + 1].trend) {
        return false;
      }
    }
    return true;
  }

  /**
   * 验证候选笔集合是否有中枢重叠区域（zg > zd）
   */
  private validateZgZdOverlap(bis: BiVo[]): {
    valid: boolean;
    zg?: number;
    zd?: number;
  } {
    if (bis.length < 3) {
      return { valid: false };
    }

    // 从前5笔（不足5笔取全部）计算 zg = min(highs)、zd = max(lows)
    const bisToCheck = bis.slice(0, Math.min(5, bis.length));
    const highMinMax = minMaxBy(bisToCheck, (bi) => bi.highest);
    const lowMinMax = minMaxBy(bisToCheck, (bi) => bi.lowest);
    if (!highMinMax || !lowMinMax) {
      return { valid: false };
    }

    const zg = highMinMax.min;
    const zd = lowMinMax.max;
    if (zg <= zd) {
      return { valid: false };
    }

    return { valid: true, zg, zd };
  }

  /**
   * 验证第4、5笔是否与zg-zd重叠
   */
  private validateFiveBiOverlap(
    fiveBis: BiVo[],
    zg: number,
    zd: number,
  ): boolean {
    return (
      this.hasOverlap(fiveBis[3], zg, zd) && this.hasOverlap(fiveBis[4], zg, zd)
    );
  }

  /**
   * 检查笔是否与中枢区间重叠
   * @param bi 笔数据
   * @param zg 中枢高
   * @param zd 中枢低
   * @returns 是否重叠
   */
  private hasOverlap(bi: BiVo, zg: number, zd: number): boolean {
    // 基本重叠检查：笔的低点 ≤ zg 且笔的高点 ≥ zd
    return bi.lowest <= zg && bi.highest >= zd;
  }

  /**
   * 检测 5-bi 基础中枢
   * @param fiveBis 笔数组（至少 5 笔）
   * @param originalBis 原始完整笔数组（用于获取正确的 ID）
   * @param startIndex 起始索引
   * @returns 中枢对象或 null
   */
  private detectChannel(
    fiveBis: BiVo[],
    originalBis: BiVo[],
    startIndex: number,
  ): ChannelVo | null {
    if (fiveBis.length < 5) {
      return null;
    }

    // 验证1：检查趋势是否交替
    if (!this.validateTrendAlternating(fiveBis)) {
      return null;
    }

    // 验证2：从候选笔集合计算zg-zd
    const zgZdResult = this.validateZgZdOverlap(fiveBis);
    if (
      !zgZdResult.valid ||
      zgZdResult.zg === undefined ||
      zgZdResult.zd === undefined
    ) {
      return null;
    }
    const { zg, zd } = zgZdResult;

    // 验证3：检查第4、5笔是否与zg-zd重叠
    if (!this.validateFiveBiOverlap(fiveBis, zg, zd)) {
      return null;
    }

    // 计算gg-dd并创建中枢对象
    const initialFiveBis = fiveBis.slice(0, 5);
    const ggDd = this.calculateGgDd(initialFiveBis);
    if (!ggDd) {
      return null;
    }

    // 计算显示范围：使用第一笔和最后一笔的中间位置
    const firstBi = originalBis[startIndex];
    const firstBiMiddleIndex = Math.floor(firstBi.originIds.length / 2);
    const displayStartId = firstBi.originIds[firstBiMiddleIndex];

    const lastBiIndex = startIndex + 4;
    const lastBi = originalBis[lastBiIndex];
    const lastBiMiddleIndex = Math.floor(lastBi.originIds.length / 2);
    const displayEndId = lastBi.originIds[lastBiMiddleIndex];

    // 创建中枢对象
    return {
      bis: [...initialFiveBis],
      zg,
      zd,
      gg: ggDd.gg,
      dd: ggDd.dd,
      level: ChannelLevel.Bi,
      type: ChannelType.Complete,
      status: ChannelStatus.Unknown, // Phase A 枚举后由 enumerateChannels 印 status
      startId: originalBis[startIndex].originIds[0],
      endId:
        originalBis[startIndex + 4].originIds[
          originalBis[startIndex + 4].originIds.length - 1
        ],
      trend: fiveBis[0].trend,
      displayStartId,
      displayEndId,
    };
  }

  /**
   * 计算一组笔的 gg（最高）和 dd（最低）
   * @param bis 笔数组
   * @returns { gg, dd } 或 null（空数组）
   */
  private calculateGgDd(bis: BiVo[]): { gg: number; dd: number } | null {
    const high = minMaxBy(bis, (bi) => bi.highest);
    const low = minMaxBy(bis, (bi) => bi.lowest);
    if (!high || !low) {
      return null;
    }
    return { gg: high.max, dd: low.min };
  }

  /**
   * 两个中枢能否合并（Phase B 谓词，镜像笔的 canMergeTwoBis）。
   *
   * 合并条件：
   * 1. 首尾中枢趋势相同（已在 isSameDirection 校验）
   * 2. 首尾中枢的时间范围重叠
   * 3. zone 兼容：合并后的 zg/zd 仍满足 zg > zd（合并后区间有效）
   *
   * @param head 首中枢
   * @param tail 尾中枢
   * @returns 能否合并
   */
  private canMergeTwoChannels(head: ChannelVo, tail: ChannelVo): boolean {
    if (!this.channelsOverlapInTime(head, tail)) {
      return false;
    }

    // zone 兼容：合并所有笔后 zg > zd 仍成立
    const allBis = [...head.bis, ...tail.bis];
    const highMinMax = minMaxBy(allBis, (bi) => bi.highest);
    const lowMinMax = minMaxBy(allBis, (bi) => bi.lowest);
    if (!highMinMax || !lowMinMax) {
      return false;
    }
    return highMinMax.min > lowMinMax.max;
  }

  private channelsOverlapInTime(head: ChannelVo, tail: ChannelVo): boolean {
    const headStart = head.bis[0]?.startTime.getTime();
    const headEnd = head.bis.at(-1)?.endTime.getTime();
    const tailStart = tail.bis[0]?.startTime.getTime();
    const tailEnd = tail.bis.at(-1)?.endTime.getTime();

    if (
      headStart === undefined ||
      headEnd === undefined ||
      tailStart === undefined ||
      tailEnd === undefined
    ) {
      return false;
    }

    return headStart <= tailEnd && tailStart <= headEnd;
  }

  /**
   * 中间中枢是否都落在首尾 envelope 内（Phase B 谓词，镜像笔的 envelope 检查）。
   *
   * envelope 取首尾中枢 gg/dd 的极值：中间中枢的 zone 必须落在
   * [min(head.dd, tail.dd), max(head.gg, tail.gg)] 内。
   *
   * @param span 中枢 span（含首尾）
   * @returns 中间中枢是否都落在 envelope 内
   */
  private middleChannelsFitEnvelope(span: readonly ChannelVo[]): boolean {
    const head = span[0];
    const tail = span[span.length - 1];
    const envelopeHigh = Math.max(head.gg, tail.gg);
    const envelopeLow = Math.min(head.dd, tail.dd);
    return span.slice(1, -1).every((middle) => {
      // 中间中枢的最高不超过 envelope 上沿，最低不低于下沿
      return middle.gg <= envelopeHigh && middle.dd >= envelopeLow;
    });
  }

  /**
   * 合并两个中枢（Phase B 操作，镜像笔的 mergeTwoBis）。
   *
   * 取 head 的起点 → tail 的终点，重算 zg/zd/gg/dd/trend，重组所有笔。
   *
   * @param head 首中枢
   * @param tail 尾中枢
   * @returns 合并后的中枢
   */
  private mergeTwoChannels(head: ChannelVo, tail: ChannelVo): ChannelVo {
    // 合并笔序列：head 的笔 + tail 的笔，按时间顺序（head 在前 tail 在后）
    // 去重首尾共享的笔（tail 的第一笔可能等于 head 的最后一笔）
    const seen = new Set<number>();
    const mergedBis: BiVo[] = [];
    for (const bi of [...head.bis, ...tail.bis]) {
      const biKey = bi.startTime.getTime();
      if (seen.has(biKey)) {
        continue;
      }
      seen.add(biKey);
      mergedBis.push(bi);
    }

    const highMinMax = minMaxBy(mergedBis, (bi) => bi.highest);
    const lowMinMax = minMaxBy(mergedBis, (bi) => bi.lowest);
    const zg = highMinMax ? highMinMax.min : head.zg;
    const zd = lowMinMax ? lowMinMax.max : head.zd;
    const gg = highMinMax ? highMinMax.max : head.gg;
    const dd = lowMinMax ? lowMinMax.min : head.dd;

    return {
      bis: mergedBis,
      zg,
      zd,
      gg,
      dd,
      level: head.level,
      type: ChannelType.Complete,
      status: ChannelStatus.Unknown, // 由 stampStatus 重新判定
      startId: head.startId,
      endId: tail.endId,
      trend: head.trend,
      displayStartId: head.displayStartId,
      displayEndId: tail.displayEndId,
    };
  }
}
