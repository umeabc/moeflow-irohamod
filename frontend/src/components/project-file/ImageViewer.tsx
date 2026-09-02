import { ExclamationCircleOutlined } from '@ant-design/icons';
import { css } from '@emotion/core';
import { Modal, Spin } from 'antd';
import Bowser from 'bowser';
import { debounce } from 'lodash-es';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { FontAwesomeIcon as Icon } from '@fortawesome/react-fontawesome';
import {
  MovableArea,
  MovableItem,
  MovableItemMargins,
  MovableItemUseRef,
  OnMoveEnd,
  OnTap,
  OnZoomEnd,
  OnZooming,
  OnZoomStart,
} from '@/components/shared/Movable';
import { SOURCE_POSITION_TYPE } from '@/constants/source';
import { FC, File, Source } from '@/interfaces';
import { AppState } from '@/store';
import { createSourceSaga, focusSource } from '@/store/source/slice';
import style from '@/style';
import { getBestTranslation } from '@/utils/source';
import { clickEffect } from '@/utils/style';
import { ImageViewerPagingPanel } from './ImageViewerPagingPanel';
import { ImageViewerSettingPanel } from './ImageViewerSettingPanel';
import { ImageViewerZoomPanel } from './ImageViewerZoomPanel';
import { MovableAreaColorBackground } from './MovableAreaColorBackground';
import { MovableAreaImageBackground } from './MovableAreaImageBackground';
import { MovableLabel } from './MovableLabel';
import { Tooltip } from '@/components/shared/Tooltip';
import { routes } from '@/pages/routes';
import { createDebugLogger } from '@/utils/debug-logger';

const debugLogger = createDebugLogger('components:project-file:ImageViewer');
/**
 * 🖥浏览器识别
 */
const browser = Bowser.getParser(window.navigator.userAgent);
const isFirefoxForAndroid = browser.satisfies({
  android: {
    firefox: '>0',
  },
});

export interface OnFocusLabel {
  ({ index }: { index: number }): void;
}
export interface Label extends Source {
  id: string;
  x: number;
  y: number;
}
export interface OnCreateLabel {
  ({ x, y }: { x: number; y: number }): void;
}
/**
 * ============= 图片翻译标记器 ================
 */
/** 图片翻译标记器的属性接口 */
interface ImageViewerProps {
  file: File;
  projectId: string;
  targetID: string;
  width: number;
  height: number;
  labels: Label[];
  loading: boolean;
  onSettingButtonClick?: () => void;
  className?: string;
}
/**
 * 图片翻译标记器
 */
export const ImageViewer: FC<ImageViewerProps> = ({
  file,
  projectId,
  targetID,
  width: imageAreaWidth,
  height: imageAreaHeight,
  labels,
  loading,
  onSettingButtonClick,
  className,
}) => {
  const imageAreaSize = { width: imageAreaWidth, height: imageAreaHeight };
  const dispatch = useDispatch();
  const history = useHistory();
  const { formatMessage } = useIntl();
  const platform = useSelector((state: AppState) => state.site.platform);
  const isMobile = platform === 'mobile';
  const savingStatus = useSelector(
    (state: AppState) => state.source.savingStatus,
  );
  const focusedSourceID = useSelector(
    (state: AppState) => state.source.focusedSource.id,
  );
  const focusedSourceEffects = useSelector(
    (state: AppState) => state.source.focusedSource.effects,
  );
  const focusedSourceNoiseFocusLabel = useSelector(
    (state: AppState) => state.source.focusedSource.noises.focusLabel,
  );
  const [focusLabelIndex, setFocusLabelIndex] = useState(-1);
  // 图片加载中
  const [imageLoading, setImageLoading] = useState(true);
  const [imageSize, setImageSize] = useState({
    width: 0,
    height: 0,
  });
  // 缩放时隐藏标签
  const [hideLabelsWhenZooming] = useState(false);
  // 开启缩放隐藏标签时，标签数超过此值才会隐藏
  const [hideLabelsWhenZoomingCount] = useState(30);
  /**
   * 图片相关
   */
  const [imageTransition, setImageTransition] = useState(''); // 图片的过渡效果
  const [imageMinScale, setImageMinScale] = useState(0.1);
  const [imageMaxScale, setImageMaxScale] = useState(5);
  const [imageScaleStep, setImageScaleStep] = useState(0.15);
  const [labelsVisible, setLabelsVisible] = useState(true); // 用于在缩放时隐藏子元素，防止渲染卡顿

  // 图片 ref
  const imageRef = useRef() as MovableItemUseRef;
  // 所有控件透明度
  const [widgetOpacity] = useState(0.8);

  useEffect(() => {
    if (focusedSourceEffects.includes('focusLabel')) {
      for (const label of labels) {
        if (label.id === focusedSourceID) {
          moveImageByLabel(label);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedSourceID, focusedSourceNoiseFocusLabel]);

  /**
   * 图片缩放控制面板相关
   */
  // 图片缩放控制面板拖动条的值
  const [imageViewerZoomPanelSliderValue, setimageViewerZoomPanelSliderValue] =
    useState(1);
  // 是否收图片缩控制台
  const [imageViewerZoomPanelShrunk, setimageViewerZoomPanelShrunk] =
    useState(true);
  // 图片缩放控制台 ref
  const imageViewerZoomPanelRef = useRef() as MovableItemUseRef;
  // 图片缩放控制台最近的边的默认值
  let defaultimageViewerZoomPanelMargins: MovableItemMargins = {
    x: { edge: 'left', px: 10 },
    y: { edge: 'bottom', px: 10 },
  };
  if (isMobile) {
    defaultimageViewerZoomPanelMargins = {
      x: { edge: 'right', px: 5 },
      y: { edge: 'top', px: 5 },
    };
  }
  // 图片缩放控制台最近的边
  const imageViewerZoomPanelMarginsRef = useRef<MovableItemMargins>(
    defaultimageViewerZoomPanelMargins,
  );

  // 图片移动区域变化时，将各个控件移动到相应地方
  useEffect(() => {
    imageViewerZoomPanelRef.current.move(
      imageViewerZoomPanelRef.current.moveWithMargins(
        imageViewerZoomPanelMarginsRef.current,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageAreaSize.width, imageAreaSize.height]);

  // 处理控制条移动结束
  const handleimageViewerZoomPanelMoveEnd: OnMoveEnd = () => {
    // 记录 margin
    const margins = imageViewerZoomPanelRef.current.getClosestMargins({
      xCenter: true,
      yCenter: true,
      xCenterTolerance: imageAreaSize.width * 0.05,
      yCenterTolerance: imageAreaSize.height * 0.05,
    });
    imageViewerZoomPanelMarginsRef.current = margins;
  };

  const handleimageViewerZoomPanelTap: OnTap = () => {
    // 延后展开，以免 pointerup 之后的 click 事件点击到展开的按钮上
    setTimeout(() => {
      setimageViewerZoomPanelShrunk((prevShrunk) => !prevShrunk);
      // 更新尺寸
      imageViewerZoomPanelRef.current.updateSize();
      // 更新位置
      imageViewerZoomPanelRef.current.move((position) => position);
    }, 100);
  };

  // 通过滑条缩放图片
  function zoomImageViaSlider(scale: number) {
    imageRef.current.zoom({ scale: scale }, { silent: true });
    setimageViewerZoomPanelSliderValue(scale);
  }

  // 放大图片
  function zoomInImage() {
    // 进行动画
    setImageTransition('transform 150ms');
    setTimeout(() => {
      setImageTransition('');
    }, 100);
    imageRef.current.zoom((prevState) => ({
      scale:
        prevState.scale +
        imageScaleStep * imageRef.current.getScaleStepScale(prevState.scale),
    }));
  }

  // 缩小图片
  function zoomOutImage() {
    // 进行动画
    setImageTransition('transform 150ms');
    setTimeout(() => {
      setImageTransition('');
    }, 100);
    imageRef.current.zoom((prevState) => ({
      scale:
        prevState.scale -
        imageScaleStep * imageRef.current.getScaleStepScale(prevState.scale),
    }));
  }

  // 当获知图片尺寸
  function calculateScale() {
    if (imageSize.width === 0 || imageSize.height === 0) {
      return;
    }
    // 最小可以缩小到屏幕 1/5 大小
    const minWidthScale = imageAreaSize.width / 5 / imageSize.width;
    const minHeightScale = imageAreaSize.height / 5 / imageSize.height;
    const minScale = Math.min(minWidthScale, minHeightScale);
    setImageMinScale(minScale);
    // 最大可以放大到屏幕的 2 倍大小（最小也是图片 3 倍大小）
    const maxWidthScale = (imageAreaSize.width * 2) / imageSize.width;
    const maxHeightScale = (imageAreaSize.height * 2) / imageSize.height;
    let maxScale = Math.max(maxWidthScale, maxHeightScale);
    if (maxScale < 3) {
      maxScale = 3;
    }
    setImageMaxScale(maxScale);
    // 设置步长
    setImageScaleStep((minScale + maxScale) / 25);
  }

  // 图片加载完成
  function handleImageLoad(imageSize: { width: number; height: number }) {
    // 设置可移动图片组件的大小
    imageRef.current.updateSize({ size: imageSize });
    // 记录图片大小
    setImageSize(imageSize);
    // 初始化图片缩放/位置
    initImage();
    // 设置已加载图片，显示图片
    setImageLoading(false);
  }

  // 初始化大小/位置，按能显示全图片的最大比例显示
  function initImage() {
    const scaleByAreaWidth = getScaleByArea('width');
    const scaleByAreaHeight = getScaleByArea('height');
    // 按小的比例缩放，以显示全部图片
    const scale =
      scaleByAreaWidth < scaleByAreaHeight
        ? scaleByAreaWidth
        : scaleByAreaHeight;
    imageRef.current.zoom({ scale, centerX: 0, centerY: 0 });
    moveImageToCenter(scale);
  }

  // 重置图片大小为实际大小
  function restoreImage() {
    // 进行动画
    setImageTransition('transform 300ms');
    setTimeout(() => {
      setImageTransition('');
    }, 300);
    // 按小的比例缩放，以显示全部图片
    const scale = 1;
    imageRef.current.zoom({ scale, centerX: 0, centerY: 0 });
    moveImageToCenter(scale);
  }

  // 获取图片缩放到移动区域宽度/高度的缩放值
  function getScaleByArea(widthOrHeight: 'width' | 'height'): number {
    const imageSize = imageRef.current.getSize();
    let scale = imageAreaSize[widthOrHeight] / imageSize[widthOrHeight];
    // 限制缩放最小/最大值
    if (scale < imageMinScale) {
      scale = imageMinScale;
    }
    if (scale > imageMaxScale) {
      scale = imageMaxScale;
    }
    return scale;
  }

  // 缩放到移动区域宽度
  function zoomImageByAreaWidth(): void {
    // 进行动画
    setImageTransition('transform 300ms');
    setTimeout(() => {
      setImageTransition('');
    }, 300);
    const scale = getScaleByArea('width');
    imageRef.current.zoom({ scale, centerX: 0, centerY: 0 });
    moveImageToCenter(scale);
  }

  // 缩放的移动区域高度
  function zoomImageByAreaHeight(): void {
    // 进行动画
    setImageTransition('transform 300ms');
    setTimeout(() => {
      setImageTransition('');
    }, 300);
    const scale = getScaleByArea('height');
    imageRef.current.zoom({ scale, centerX: 0, centerY: 0 });
    moveImageToCenter(scale);
  }

  // 移动图片到中心位置
  function moveImageToCenter(scale: number): void {
    const imageSize = imageRef.current.getSize();
    const x = (1 - (imageSize.width * scale) / imageAreaSize.width) / 2;
    const y = (1 - (imageSize.height * scale) / imageAreaSize.height) / 2;
    imageRef.current.move({ x, y });
  }

  // 移动图片，使指定标签移动到视野中心位置
  function moveImageByLabel(label: Label): void {
    const imageSize = imageRef.current.getSize();
    const scale = imageRef.current.getState().scale;
    const imageScaledSize = {
      width: imageSize.width * scale,
      height: imageSize.height * scale,
    };
    const centerX = (1 - imageScaledSize.width / imageAreaSize.width) / 2;
    const centerY = (1 - imageScaledSize.height / imageAreaSize.height) / 2;
    const x =
      centerX + (imageScaledSize.width * (0.5 - label.x)) / imageAreaSize.width;
    const y =
      centerY +
      (imageScaledSize.height * (0.5 - label.y)) / imageAreaSize.height;
    imageRef.current.move({ x: x, y: y });
  }

  // 防抖，缩放停止一段时间后设置 imageViewerZoomPanelSliderValue，以防止频繁 render 控制器导致的卡顿
  const debouncedSetimageViewerZoomPanelSliderValue = debounce((scale) => {
    setimageViewerZoomPanelSliderValue(scale);
  }, 150);

  // 是否需要隐藏 labels，以减少卡顿
  const needHideLabels: () => boolean = () => {
    return (
      isFirefoxForAndroid || // Firefox for Android，很少标签就用于卡顿，隐藏标签
      (hideLabelsWhenZooming && labels.length > hideLabelsWhenZoomingCount) // 用户手动设置隐藏
    );
  };

  // 处理图片点击
  const handleImageTap: OnTap = ({ x, y, button }) => {
    if (button === 0) {
      dispatch(
        createSourceSaga({
          fileID: file.id,
          x,
          y,
          positionType: SOURCE_POSITION_TYPE.IN,
        }),
      );
    } else if (button === 2) {
      dispatch(
        createSourceSaga({
          fileID: file.id,
          x,
          y,
          positionType: SOURCE_POSITION_TYPE.OUT,
        }),
      );
    }
  };

  const handleFocusIndexChange = (index: number): void => {
    setFocusLabelIndex(index);
    dispatch(
      focusSource({
        id: labels[index]?.id,
        effects: isMobile
          ? ['scrollIntoView']
          : ['focusInput', 'scrollIntoView'],
        noises: isMobile ? [] : ['focusInput'],
      }),
    );
  };

  const focusIndex = labels.findIndex((label) => label.focus);
  useEffect(() => {
    setFocusLabelIndex(focusIndex);
  }, [focusIndex]);

  // 处理图片开始缩放回调
  const handleImageZoomStart: OnZoomStart = () => {
    // 安卓浏览器，隐藏 label 停止渲染，以减少卡顿
    if (needHideLabels()) {
      setLabelsVisible(false);
    }
  };

  // 处理图片缩放回调
  const handleImageZooming: OnZooming = ({ scale }) => {
    debouncedSetimageViewerZoomPanelSliderValue(scale);
  };

  // 处理图片开始缩放回调
  const handleImageZoomEnd: OnZoomEnd = () => {
    // 安卓浏览器，隐藏 label 停止渲染，以减少卡顿
    if (needHideLabels()) {
      setLabelsVisible(true);
    }
  };

  // 当 图片移动区域变化 或 图片大小变化 时，计算最大/最小比例以及步长
  useEffect(() => {
    calculateScale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    imageAreaSize.width,
    imageAreaSize.height,
    imageSize.width,
    imageSize.height,
  ]);

  // 图片
  const backgroundImage = file.url ? (
    <MovableAreaImageBackground
      onLoad={handleImageLoad}
      src={file.url}
    ></MovableAreaImageBackground>
  ) : (
    <div></div>
  );

  const goBack = () => {
    if (history.length > 2) {
      history.goBack();
    } else {
      // replace when there is no previous state
      history.replace(
        routes.dashboard.project.show.replace(':projectId', projectId),
      );
    }
  };

  // 标签
  const movableLabels = labels.map((label: Label, index) => {
    const bestTranslation = getBestTranslation(label);
    const content =
      bestTranslation === undefined
        ? undefined
        : bestTranslation.proofreadContent
          ? bestTranslation.proofreadContent
          : bestTranslation.content;

    return (
      <MovableLabel
        index={index}
        id={label.id}
        key={label.id}
        x={label.x}
        y={label.y}
        positionType={label.positionType}
        status={label.labelStatus}
        content={content}
        styleTransition={imageTransition}
      >
        {index + 1}
      </MovableLabel>
    );
  });

  return (
    <div
      className={className}
      css={css`
        position: relative;
        width: ${imageAreaSize.width}px;
        height: ${imageAreaSize.height}px;
        overflow: hidden;
        .ImageViewer__Button {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 40px;
          height: 40px;
          background-color: var(--moeflow-control);
          ${clickEffect(
            css`
              background-color: ${style.widgetButtonHoverBackgroundColor};
            `,
            css`
              color: ${style.widgetButtonActiveColor};
            `,
          )}
          &.ImageViewer__BackButton {
            position: absolute;
            top: ${isMobile ? '5px' : '10px'};
            left: ${isMobile ? '5px' : '10px'};
            z-index: 5;
            border-radius: ${style.borderRadiusBase} 0 0
              ${style.borderRadiusBase};
          }
        }
        .ImageViewer__ImageViewerSettingPanel {
          position: absolute;
          top: ${isMobile ? '5px' : '10px'};
          left: ${isMobile ? '45px' : '50px'};
          z-index: 4;
          background-color: var(--moeflow-control);
        }
        .ImageViewer__ImageViewerPagingPanel {
          position: absolute;
          top: ${isMobile ? '5px' : '10px'};
          right: ${isMobile ? '55px' : '10px'};
          z-index: 5;
          background-color: var(--moeflow-control);
        }
      `}
    >
      <Spin
        spinning={imageLoading || loading}
        size="large"
        css={css`
          max-height: none !important;
        `}
      >
        <MovableArea
          width={imageAreaSize.width}
          height={imageAreaSize.height}
          backgroundElement={
            <MovableAreaColorBackground
              color={style.translatorColorBackground}
            ></MovableAreaColorBackground>
          }
        >
          <MovableItem
            layer={'front'}
            ref={imageViewerZoomPanelRef}
            allowMove={!isMobile}
            onTap={handleimageViewerZoomPanelTap}
            onMoveEnd={handleimageViewerZoomPanelMoveEnd}
            otherStyle={{ pointerEvents: 'none' }}
            data-testid="MovableItem__ImageViewerZoomPanel"
          >
            <ImageViewerZoomPanel
              opacity={widgetOpacity}
              shrunk={imageViewerZoomPanelShrunk}
              restoreImage={restoreImage}
              zoomImage={zoomImageViaSlider}
              zoomInImage={zoomInImage}
              zoomOutImage={zoomOutImage}
              sliderValue={imageViewerZoomPanelSliderValue}
              imageMinScale={imageMinScale}
              imageMaxScale={imageMaxScale}
              imageScaleStep={imageScaleStep}
              zoomImageByAreaWidth={zoomImageByAreaWidth}
              zoomImageByAreaHeight={zoomImageByAreaHeight}
            />
          </MovableItem>
          <MovableItem
            limitInArea={false}
            transition={imageTransition}
            allowZoom={true}
            minScale={imageMinScale}
            maxScale={imageMaxScale}
            scaleStep={imageScaleStep}
            onTap={handleImageTap}
            // TODO: 看看手机版长按添加标记到底适不适合
            // onLongPress={isMobile ? handleImageLongPress : undefined}
            onZoomStart={handleImageZoomStart}
            onZooming={handleImageZooming}
            onZoomEnd={handleImageZoomEnd}
            ref={imageRef}
            updateSizeOnMounted={false}
            data-testid="MovableItem__Image"
          >
            <MovableArea
              width={imageSize.width}
              height={imageSize.height}
              backgroundElement={backgroundImage}
              focusIndex={focusLabelIndex}
              onFocusIndexChange={handleFocusIndexChange}
              data-testid="MovableArea__Image"
            >
              {labelsVisible && movableLabels}
            </MovableArea>
          </MovableItem>
        </MovableArea>
      </Spin>
      <Tooltip
        title={formatMessage({
          id: 'imageTranslator.imageViewerZoomPanel.back',
        })}
      >
        <div
          className="ImageViewer__Button ImageViewer__BackButton"
          data-testid="ImageViewer__BackButton"
          onClick={() => {
            let unloadMessage = '';
            if (savingStatus === 'saving') {
              unloadMessage = formatMessage({
                id: 'imageTranslator.leaveWithSaving',
              });
            } else if (savingStatus === 'saveFailed') {
              unloadMessage = formatMessage({
                id: 'imageTranslator.leaveWithSaveFailed',
              });
            }
            if (savingStatus === 'saving' || savingStatus === 'saveFailed') {
              Modal.confirm({
                title: unloadMessage,
                content: formatMessage({
                  id: 'imageTranslator.leaveTip',
                }),
                icon: <ExclamationCircleOutlined />,
                onOk: goBack,
                onCancel: () => {},
                okText: formatMessage({ id: 'form.ok' }),
                cancelText: formatMessage({ id: 'form.cancel' }),
              });
            } else {
              goBack();
            }
          }}
        >
          {savingStatus === 'saving' && (
            <Icon
              className="ImageViewer__ButtonIcon"
              icon="spinner"
              spin={true}
            ></Icon>
          )}
          {savingStatus === 'saveFailed' && (
            <Icon
              className="ImageViewer__ButtonIcon"
              icon="exclamation-triangle"
              style={{ color: style.warningColor }}
            />
          )}
          {savingStatus === 'saveSuccessful' && (
            <Icon
              className="ImageViewer__ButtonIcon"
              icon="chevron-left"
            ></Icon>
          )}
        </div>
      </Tooltip>

      <ImageViewerSettingPanel
        className="ImageViewer__ImageViewerSettingPanel"
        onSettingButtonClick={onSettingButtonClick}
      />

      <ImageViewerPagingPanel
        className="ImageViewer__ImageViewerPagingPanel"
        targetID={targetID}
        currentImageID={file.id}
        prevImageID={file.prevImage?.id}
        nextImageID={file.nextImage?.id}
        loading={savingStatus === 'saving'}
        disibled={savingStatus === 'saveFailed'}
      />

      {file.prevImage && (
        <img
          src={file.prevImage.url}
          style={{ display: 'none' }}
          alt="prev img cache"
        />
      )}
      {file.nextImage && (
        <img
          src={file.nextImage.url}
          style={{ display: 'none' }}
          alt="next img cache"
        />
      )}
    </div>
  );
};
