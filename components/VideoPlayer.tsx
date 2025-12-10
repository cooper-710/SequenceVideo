import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, Maximize2, Minimize2, 
  Pencil, MoveDiagonal, Circle as CircleIcon, 
  Undo2, RotateCw, Trash2, ArrowRight, Check, Eye, EyeOff, X, ChevronDown
} from 'lucide-react';
import { Annotation, Drawing, DrawingTool, Point } from '../types';
import { getVideo } from '../utils/videoStorage';

interface VideoPlayerProps {
  src: string;
  annotations: Annotation[];
  onAddAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation?: (annotationId: string) => void;
  className?: string;
}

const COLORS = ['#F97316', '#22C55E', '#3B82F6', '#EF4444', '#EAB308', '#FFFFFF'];

const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Custom Protractor Icon
const ProtractorIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M21 17a9 9 0 0 0-18 0" />
    <path d="M3 17h18" />
    <path d="M12 17v-4" />
    <path d="M12 8v1" />
  </svg>
);

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  src, 
  annotations = [], 
  onAddAnnotation,
  onDeleteAnnotation,
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seekRef = useRef<number | null>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const videoUrlRef = useRef<string | null>(null);
  const rafSeekRef = useRef<number | null>(null);
  const lastSeekTimeRef = useRef<number>(0);
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Annotation/Drawing State
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawingTool>('pen');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [currentDrawings, setCurrentDrawings] = useState<Drawing[]>([]);
  const [drawingHistory, setDrawingHistory] = useState<Drawing[][]>([]); // For undo/redo
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [annotationDuration, setAnnotationDuration] = useState<number | null>(null); // null = full video length
  const [annotationDurationInput, setAnnotationDurationInput] = useState<string>(''); // For input field (allows empty)
  const [annotationDropdownOpen, setAnnotationDropdownOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 }); // Store original video size for scaling
  
  // Drawing Interaction State
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [anglePoints, setAnglePoints] = useState<Point[]>([]); 

  // Load video from storage if needed
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    // Reset duration and current time when source changes
    setDuration(0);
    setCurrentTime(0);

    const loadVideo = async () => {
      try {
        const url = await getVideo(src);
        if (isMounted) {
          // Clean up old blob URL if it exists
          if (videoUrlRef.current && videoUrlRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(videoUrlRef.current);
          }
          videoUrlRef.current = url;
          setVideoSrc(url);
          setIsLoading(false);
          
          // Force video to load metadata after a short delay
          setTimeout(() => {
            if (videoRef.current && isMounted) {
              videoRef.current.load();
            }
          }, 100);
        }
      } catch (error) {
        console.error('Error loading video:', error);
        if (isMounted) {
          // If it's a blob URL that failed, it's from an old session and can't be recovered
          if (src.startsWith('blob:')) {
            setVideoSrc(''); // Show error state - video is lost
            setIsLoading(false);
          } else if (src.startsWith('data:') || src.startsWith('http')) {
            // Try using src directly for data URLs or external URLs
            setVideoSrc(src);
            setIsLoading(false);
          } else {
            setVideoSrc(''); // Show error state
            setIsLoading(false);
          }
        }
      }
    };

    if (src) {
      loadVideo();
    } else {
      setVideoSrc('');
      setIsLoading(false);
    }

    return () => {
      isMounted = false;
      // Cleanup blob URL on unmount
      if (videoUrlRef.current && videoUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrlRef.current);
      }
    };
  }, [src]);

  // Active annotations to display based on current time (playback mode)
  // Check if current time is within the annotation's time range
  const activeAnnotations = showAnnotations ? annotations.filter(a => {
    const startTime = a.startTime ?? a.timestamp;
    const endTime = a.endTime ?? (duration || Infinity);
    return currentTime >= startTime && currentTime <= endTime;
  }) : [];
  
  const activeDisplayAnnotation = activeAnnotations[0] || null;
  
  // All annotations with drawings (for always-visible dropdown)
  const annotationsWithDrawings = annotations.filter(a => a.drawings && a.drawings.length > 0);

  // Seek to annotation start time
  const seekToAnnotation = (annotation: Annotation) => {
    const startTime = annotation.startTime ?? annotation.timestamp;
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      setCurrentTime(startTime);
    }
    setAnnotationDropdownOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!annotationDropdownOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.annotation-dropdown-container')) {
        setAnnotationDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [annotationDropdownOpen]);

  // --- Video Event Handlers ---

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    const onTimeUpdate = () => {
      // Only update from video's timeupdate if we're not manually seeking
      if (!isSeeking) {
        setCurrentTime(video.currentTime);
      }
    };
    
    const onLoadedMetadata = () => {
      // Set duration when metadata loads
      if (video.duration && isFinite(video.duration)) {
        setDuration(video.duration);
      }
    };
    
    const onLoadedData = () => {
      // Backup: also check duration when data loads
      if (video.duration && isFinite(video.duration) && duration === 0) {
        setDuration(video.duration);
      }
    };
    
    const onCanPlay = () => {
      // Another backup: check duration when video can play
      if (video.duration && isFinite(video.duration) && duration === 0) {
        setDuration(video.duration);
      }
    };
    
    const onEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('ended', onEnded);

    // Force load metadata if video is already loaded
    if (video.readyState >= 1) {
      onLoadedMetadata();
    }

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('ended', onEnded);
    };
  }, [isSeeking, videoSrc, duration]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Close color picker when clicking outside
  useEffect(() => {
    if (!colorPickerOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.color-picker-container')) {
        setColorPickerOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [colorPickerOpen]);

  // Toggle fullscreen
  const toggleFullscreen = async () => {
    if (!containerRef.current) {
      return;
    }

    // Check actual browser fullscreen state
    const isBrowserFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    // Check if we're in CSS-based fullscreen (state-based)
    const isCSSFullscreen = isFullscreen && !isBrowserFullscreen;

    // If we're in CSS-based fullscreen, just toggle the state
    if (isCSSFullscreen) {
      setIsFullscreen(false);
      return;
    }

    try {
      if (!isBrowserFullscreen) {
        // Enter fullscreen
        const element = containerRef.current;
        let fullscreenPromise: Promise<void> | null = null;
        
        if (element.requestFullscreen) {
          fullscreenPromise = element.requestFullscreen();
        } else if ((element as any).webkitRequestFullscreen) {
          fullscreenPromise = (element as any).webkitRequestFullscreen();
        } else if ((element as any).mozRequestFullScreen) {
          fullscreenPromise = (element as any).mozRequestFullScreen();
        } else if ((element as any).msRequestFullscreen) {
          fullscreenPromise = (element as any).msRequestFullscreen();
        } else {
          // Fallback to CSS-based fullscreen
          setIsFullscreen(true);
          return;
        }

        if (fullscreenPromise) {
          // Add timeout to detect if promise hangs
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Fullscreen request timeout')), 500);
          });

          Promise.race([fullscreenPromise, timeoutPromise])
            .catch(() => {
              // Fallback to CSS-based fullscreen
              setIsFullscreen(true);
            });
          
          // Also set CSS-based fullscreen immediately as backup
          // The API will override if it works
          setIsFullscreen(true);
        }
      } else {
        // Exit fullscreen
        let exitPromise: Promise<void> | null = null;
        
        if (document.exitFullscreen) {
          exitPromise = document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          exitPromise = (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          exitPromise = (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          exitPromise = (document as any).msExitFullscreen();
        }

        if (exitPromise) {
          try {
            await exitPromise;
          } catch (err) {
            setIsFullscreen(false);
          }
        }
      }
    } catch (error) {
      // Fallback: use CSS-based fullscreen
      setIsFullscreen(!isBrowserFullscreen);
    }
  };

  // Sync Canvas Size to Video Size and store video dimensions
  useEffect(() => {
    const resizeCanvas = () => {
      if (containerRef.current && canvasRef.current && videoRef.current) {
        const { width, height } = videoRef.current.getBoundingClientRect();
        const video = videoRef.current;
        
        // Store actual video dimensions (not just display size) for proper scaling
        const videoWidth = video.videoWidth || width;
        const videoHeight = video.videoHeight || height;
        
        // Only update videoSize if we have actual video dimensions
        if (videoWidth > 0 && videoHeight > 0) {
          setVideoSize({ width: videoWidth, height: videoHeight });
        }
        
        // Get device pixel ratio for high-DPI rendering
        const dpr = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) return;
        
        // Set canvas internal resolution to high-DPI
        // Note: Setting width/height resets the context transform
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        
        // Reset transform and scale context to match device pixel ratio
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        
        // Set CSS size to display size (so it displays at the correct size)
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        
        redrawCanvas();
      }
    };

    window.addEventListener('resize', resizeCanvas);
    const timeout = setTimeout(resizeCanvas, 100); 
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      clearTimeout(timeout);
    };
  }, [isAnnotating, isFullscreen, currentDrawings, activeAnnotations, currentTime, anglePoints, currentPoint, showAnnotations]);

  // Redraw Canvas Logic
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Get display size (CSS pixels) since context is scaled by DPR
    const displayWidth = canvas.getBoundingClientRect().width;
    const displayHeight = canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // 1. Draw drawings from existing annotations (playback mode)
    // Draw all active annotations, not just the first one
    if (!isAnnotating && showAnnotations) {
      activeAnnotations.forEach(annotation => {
        if (annotation.drawings) {
          annotation.drawings.forEach(d => drawShape(ctx, d));
        }
      });
    }

    // 2. Draw current session drawings (edit mode)
    if (isAnnotating) {
      currentDrawings.forEach(d => drawShape(ctx, d));

      // 3. Draw shape in progress (Drag to draw tools)
      if (isDrawing && startPoint && currentPoint && activeTool !== 'angle') {
         const previewDrawing: Drawing = {
            id: 'temp',
            tool: activeTool,
            start: startPoint,
            end: currentPoint,
            points: activeTool === 'pen' ? [] : [],
            color: selectedColor,
            timestamp: currentTime
         };
         drawShape(ctx, previewDrawing);
      }

      // 4. Draw Angle Tool Progress (Click-based)
      if (activeTool === 'angle') {
        // Calculate scale for proportional sizing
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const displayWidth = rect.width;
        const displayHeight = rect.height;
        const baseSize = 1920;
        const scale = Math.min(displayWidth / baseSize, displayHeight / (baseSize * 9/16));
        const pointSize = Math.max(3, Math.min(7, 5 * scale));
        
        // Draw confirmed points
        ctx.fillStyle = selectedColor;
        anglePoints.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, pointSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = Math.max(0.5, 1 * scale);
          ctx.stroke();
        });

        // Draw visual guide lines
        if (anglePoints.length > 0 && currentPoint) {
           const lineWidth = Math.max(1.5, Math.min(3, 2 * scale));
           ctx.beginPath();
           ctx.strokeStyle = selectedColor;
           ctx.lineWidth = lineWidth;
           ctx.setLineDash([Math.max(3, 5 * scale), Math.max(3, 5 * scale)]);
           ctx.moveTo(anglePoints[anglePoints.length - 1].x, anglePoints[anglePoints.length - 1].y);
           ctx.lineTo(currentPoint.x, currentPoint.y);
           ctx.stroke();
           ctx.setLineDash([]);
        }

        // Draw first arm if we have 2 points
        if (anglePoints.length === 2) {
          const lineWidth = Math.max(2, Math.min(5, 3 * scale));
          ctx.beginPath();
          ctx.strokeStyle = selectedColor;
          ctx.lineWidth = lineWidth;
          ctx.moveTo(anglePoints[0].x, anglePoints[0].y);
          ctx.lineTo(anglePoints[1].x, anglePoints[1].y);
          ctx.stroke();
        }
      }
    }
  };

  const drawShape = (ctx: CanvasRenderingContext2D, drawing: Drawing) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Get display size (CSS pixels) for scale calculation
    const rect = canvas.getBoundingClientRect();
    const displayWidth = rect.width;
    const displayHeight = rect.height;
    
    // Scale line width based on canvas size to keep drawings proportional
    const baseSize = 1920; // Base reference size (typical video width)
    const scale = Math.min(displayWidth / baseSize, displayHeight / (baseSize * 9/16));
    const lineWidth = Math.max(2, Math.min(5, 3 * scale));
    
    ctx.strokeStyle = drawing.color;
    ctx.fillStyle = drawing.color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (drawing.tool) {
      case 'pen':
        if (drawing.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
        for (let i = 1; i < drawing.points.length; i++) {
          ctx.lineTo(drawing.points[i].x, drawing.points[i].y);
        }
        ctx.stroke();
        break;

      case 'line':
        if (drawing.start && drawing.end) {
          ctx.beginPath();
          ctx.moveTo(drawing.start.x, drawing.start.y);
          ctx.lineTo(drawing.end.x, drawing.end.y);
          ctx.stroke();
        }
        break;

      case 'arrow':
        if (drawing.start && drawing.end) {
          // Line
          ctx.beginPath();
          ctx.moveTo(drawing.start.x, drawing.start.y);
          ctx.lineTo(drawing.end.x, drawing.end.y);
          ctx.stroke();

          // Arrowhead
          const angle = Math.atan2(drawing.end.y - drawing.start.y, drawing.end.x - drawing.start.x);
          const headLength = Math.max(10, Math.min(30, 20 * scale));
          ctx.beginPath();
          ctx.moveTo(drawing.end.x, drawing.end.y);
          ctx.lineTo(drawing.end.x - headLength * Math.cos(angle - Math.PI / 6), drawing.end.y - headLength * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(drawing.end.x - headLength * Math.cos(angle + Math.PI / 6), drawing.end.y - headLength * Math.sin(angle + Math.PI / 6));
          ctx.fill();
        }
        break;
      
      case 'circle':
        if (drawing.start && drawing.end) {
           const radius = Math.sqrt(Math.pow(drawing.end.x - drawing.start.x, 2) + Math.pow(drawing.end.y - drawing.start.y, 2));
           ctx.beginPath();
           ctx.arc(drawing.start.x, drawing.start.y, radius, 0, 2 * Math.PI);
           ctx.stroke();
        }
        break;

      case 'angle':
        if (drawing.points && drawing.points.length === 3) {
           const [p1, vertex, p2] = drawing.points;
           
           // Draw Arms
           ctx.beginPath();
           ctx.moveTo(p1.x, p1.y);
           ctx.lineTo(vertex.x, vertex.y);
           ctx.lineTo(p2.x, p2.y);
           ctx.stroke();

           // Draw Vertex Dot
           const vertexSize = Math.max(3, Math.min(6, 4 * scale));
           ctx.beginPath();
           ctx.arc(vertex.x, vertex.y, vertexSize, 0, Math.PI * 2);
           ctx.fill();

           // Draw Angle Arc
           const radius = Math.max(20, Math.min(50, 30 * scale));
           const a1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
           const a2 = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);
           
           // Ensure we draw the interior angle
           let diff = a2 - a1;
           while (diff <= -Math.PI) diff += 2*Math.PI;
           while (diff > Math.PI) diff -= 2*Math.PI;

           ctx.beginPath();
           ctx.globalAlpha = 0.2;
           ctx.moveTo(vertex.x, vertex.y);
           ctx.arc(vertex.x, vertex.y, radius, a1, a1 + diff, false);
           ctx.fill();
           ctx.globalAlpha = 1.0;
           ctx.stroke();

           // Draw Text Label
           if (drawing.text) {
             ctx.save();
             ctx.textBaseline = 'middle';
             ctx.textAlign = 'center';
             // Position text slightly along the bisector
             const bisectAngle = a1 + diff/2;
             const textDist = Math.max(30, Math.min(80, 50 * scale));
             ctx.font = `bold ${Math.max(12, Math.min(20, 16 * scale))}px Inter, sans-serif`;
             const textX = vertex.x + Math.cos(bisectAngle) * textDist;
             const textY = vertex.y + Math.sin(bisectAngle) * textDist;

             ctx.lineWidth = 3;
             ctx.strokeStyle = 'black';
             ctx.strokeText(drawing.text, textX, textY);
             ctx.fillStyle = 'white';
             ctx.fillText(drawing.text, textX, textY);
             ctx.restore();
           }
        }
        break;
    }
  };

  // --- Interaction Logic ---

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Handle both mouse and touch events
    let clientX, clientY;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    // Since context is scaled by DPR, coordinates are in CSS pixels
    // So we use rect dimensions directly (no scaling needed)
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isAnnotating) return;
    
    const point = getCanvasPoint(e);

    if (activeTool === 'angle') {
       const newPoints = [...anglePoints, point];
       setAnglePoints(newPoints);
       
       if (newPoints.length === 3) {
          // Calculate Final Angle
          const [p1, vertex, p2] = newPoints;
          const a1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
          const a2 = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);
          
          let diff = a2 - a1;
          while (diff <= -Math.PI) diff += 2*Math.PI;
          while (diff > Math.PI) diff -= 2*Math.PI;
          
          const angleDeg = Math.abs(diff * 180 / Math.PI);
          
          const newAngle: Drawing = {
             id: Date.now().toString(),
             tool: 'angle',
             color: selectedColor,
             points: newPoints,
             timestamp: currentTime,
             text: `${angleDeg.toFixed(1)}°`
          };
          const updated = [...currentDrawings, newAngle];
          setCurrentDrawings(updated);
          saveToHistory(updated);
          setAnglePoints([]); // Reset
       }
       return;
    }

    setIsDrawing(true);
    setStartPoint(point);
    setCurrentPoint(point);
    
    if (activeTool === 'pen') {
       setCurrentDrawings(prev => [...prev, {
         id: Date.now().toString(),
         tool: 'pen',
         points: [point],
         color: selectedColor,
         timestamp: currentTime
       }]);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isAnnotating) return;
    const point = getCanvasPoint(e);
    
    // Always update current point for tool previews (ghost lines)
    setCurrentPoint(point);

    if (activeTool === 'angle') {
       redrawCanvas(); // Re-render to show elastic line
       return;
    }

    if (!isDrawing) return;

    if (activeTool === 'pen') {
      setCurrentDrawings(prev => {
        const last = prev[prev.length - 1];
        if (!last || last.tool !== 'pen') return prev;
        // Optimization: only add point if distance is significant
        const lastPoint = last.points[last.points.length - 1];
        const dist = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
        if (dist < 2) return prev;

        return [
          ...prev.slice(0, -1),
          { ...last, points: [...last.points, point] }
        ];
      });
    }
    redrawCanvas();
  };

  const handlePointerUp = () => {
    if (!isAnnotating) return;
    if (activeTool === 'angle') return;
    if (!isDrawing) return;
    
    // Save to history when stroke is complete
    if (activeTool === 'pen') {
      // For pen, save history if there's a drawing with points
      const lastDrawing = currentDrawings[currentDrawings.length - 1];
      if (lastDrawing && lastDrawing.tool === 'pen' && lastDrawing.points.length > 1) {
        saveToHistory([...currentDrawings]);
      }
    } else if (startPoint && currentPoint) {
      const newShape: Drawing = {
        id: Date.now().toString(),
        tool: activeTool,
        start: startPoint,
        end: currentPoint,
        color: selectedColor,
        points: [],
        timestamp: currentTime
      };
      const updated = [...currentDrawings, newShape];
      setCurrentDrawings(updated);
      saveToHistory(updated);
    }
    
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
    redrawCanvas();
  };


  // --- Controls ---

  const enterAnnotationMode = async () => {
    if (videoRef.current) videoRef.current.pause();
    setIsPlaying(false);
    setIsAnnotating(true);
    // Default to full video duration (or 10 seconds if duration not loaded yet)
    const defaultDuration = duration ? Math.floor(duration) : 10;
    setAnnotationDuration(defaultDuration);
    setAnnotationDurationInput(defaultDuration.toString());
    setDrawingHistory([[]]);
    setHistoryIndex(0);
    // Force fullscreen on mobile for better drawing experience
    if (window.innerWidth < 768 && !isFullscreen && containerRef.current) {
      try {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen();
        } else if ((containerRef.current as any).mozRequestFullScreen) {
          await (containerRef.current as any).mozRequestFullScreen();
        } else if ((containerRef.current as any).msRequestFullscreen) {
          await (containerRef.current as any).msRequestFullscreen();
        }
        } catch (error) {
          // Silently fallback to CSS fullscreen
        }
    }
  };

  const saveAnnotation = () => {
    const startTime = currentTime;
    const displayDuration = annotationDuration || Math.floor(duration) || 10; // Default to full video or 10 seconds
    const endTime = Math.min(currentTime + displayDuration, duration || Infinity);
    
    onAddAnnotation({
      id: Date.now().toString(),
      timestamp: currentTime,
      startTime: startTime,
      endTime: endTime,
      drawings: currentDrawings
    });
    exitAnnotationMode();
  };

  // Undo/Redo functionality
  const saveToHistory = useCallback((drawings: Drawing[]) => {
    setDrawingHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push([...drawings]);
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const newDrawings = [...drawingHistory[newIndex]];
      setHistoryIndex(newIndex);
      setCurrentDrawings(newDrawings);
      // Canvas will redraw via useEffect when currentDrawings changes
    }
  };

  const handleRedo = () => {
    if (historyIndex < drawingHistory.length - 1) {
      const newIndex = historyIndex + 1;
      const newDrawings = [...drawingHistory[newIndex]];
      setHistoryIndex(newIndex);
      setCurrentDrawings(newDrawings);
      // Canvas will redraw via useEffect when currentDrawings changes
    }
  };

  const handleClear = () => {
    setCurrentDrawings([]);
    setAnglePoints([]);
    saveToHistory([]);
    // Canvas will redraw via useEffect when currentDrawings changes
  };

  const exitAnnotationMode = () => {
    setIsAnnotating(false);
    setCurrentDrawings([]);
    setAnglePoints([]);
    setAnnotationDuration(null); // Reset duration
    setAnnotationDurationInput('');
    setDrawingHistory([]);
    setHistoryIndex(-1);
    // Don't force exit fullscreen - let user control it with the button
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  // Calculate time from mouse/touch position on scrubber
  const getTimeFromPosition = useCallback((clientX: number): number => {
    if (!scrubberRef.current) return 0;
    const video = videoRef.current;
    // Use video.duration if available, otherwise fall back to state duration
    const videoDuration = (video && video.duration && isFinite(video.duration)) ? video.duration : duration;
    if (!videoDuration || videoDuration === 0) return 0;
    
    const rect = scrubberRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percentage * videoDuration;
  }, [duration]);

  // Direct seek update - updates video immediately with retry logic
  const updateVideoTime = useCallback((time: number, force = false) => {
    const video = videoRef.current;
    if (!video) return;
    
    // Get actual video duration from element if available
    const videoDuration = (video.duration && isFinite(video.duration)) ? video.duration : duration;
    if (!videoDuration || videoDuration === 0) {
      // Can't seek if we don't know the duration yet
      return;
    }
    
    if (!isNaN(time) && time >= 0 && time <= videoDuration) {
      const clampedTime = Math.max(0, Math.min(time, videoDuration));
      
      // Store target time
      seekRef.current = clampedTime;
      
      // During dragging, always update regardless of difference
      // Otherwise, only update if there's a meaningful difference or forced
      const isDragging = isDraggingRef.current;
      
      // Always update during drag, or if forced, or if difference is significant
      if (force || isDragging) {
        // During drag, update immediately - no checks, no delays
        video.currentTime = clampedTime;
        setCurrentTime(clampedTime);
      } else {
        // For non-drag updates, check if difference is significant
        const timeDiff = Math.abs(video.currentTime - clampedTime);
        if (timeDiff > 0.001) {
          video.currentTime = clampedTime;
          setCurrentTime(clampedTime);
        }
      }
    }
  }, [duration]);

  // Handle mouse/touch down on scrubber track
  const handleScrubberMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsSeeking(true);
    isDraggingRef.current = true;
    
    if (videoRef.current) {
      // Pause video during scrubbing for precise control
      if (!videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }

    // Get initial position
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const time = getTimeFromPosition(clientX);
    updateVideoTime(time, true);
  };

  // Handle mouse/touch move during scrubbing
  const handleScrubberMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDraggingRef.current) return;
    
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const time = getTimeFromPosition(clientX);
    updateVideoTime(time, true);
  }, [getTimeFromPosition, updateVideoTime]);

  // Handle mouse/touch up
  const handleScrubberMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    
    isDraggingRef.current = false;
    lastSeekTimeRef.current = 0;
    
    // Cancel any pending RAF
    if (rafSeekRef.current !== null) {
      cancelAnimationFrame(rafSeekRef.current);
      rafSeekRef.current = null;
    }
    
    // Ensure final position is set
    if (seekRef.current !== null && videoRef.current) {
      const finalTime = seekRef.current;
      videoRef.current.currentTime = finalTime;
      setCurrentTime(finalTime);
    }
    
    // Re-enable timeupdate after a brief delay
    setTimeout(() => {
      setIsSeeking(false);
      seekRef.current = null;
    }, 100);
  }, []);

  // Continuous update loop during drag
  useEffect(() => {
    if (isSeeking && isDraggingRef.current) {
      const updateLoop = () => {
        if (isDraggingRef.current && seekRef.current !== null && videoRef.current) {
          // Continuously sync video to the target time during drag
          const targetTime = seekRef.current;
          const currentVideoTime = videoRef.current.currentTime;
          
          // If there's a difference, update it
          if (Math.abs(currentVideoTime - targetTime) > 0.01) {
            videoRef.current.currentTime = targetTime;
            setCurrentTime(targetTime);
          }
          
          rafSeekRef.current = requestAnimationFrame(updateLoop);
        }
      };
      
      rafSeekRef.current = requestAnimationFrame(updateLoop);
      
      return () => {
        if (rafSeekRef.current !== null) {
          cancelAnimationFrame(rafSeekRef.current);
          rafSeekRef.current = null;
        }
      };
    }
  }, [isSeeking]);

  // Set up global mouse/touch listeners for scrubbing
  useEffect(() => {
    if (isSeeking) {
      document.addEventListener('mousemove', handleScrubberMouseMove);
      document.addEventListener('mouseup', handleScrubberMouseUp);
      document.addEventListener('touchmove', handleScrubberMouseMove, { passive: false });
      document.addEventListener('touchend', handleScrubberMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleScrubberMouseMove);
        document.removeEventListener('mouseup', handleScrubberMouseUp);
        document.removeEventListener('touchmove', handleScrubberMouseMove);
        document.removeEventListener('touchend', handleScrubberMouseUp);
      };
    }
  }, [isSeeking, handleScrubberMouseMove, handleScrubberMouseUp]);

  const handleSeekStart = () => {
    setIsSeeking(true);
    isDraggingRef.current = true;
    lastSeekTimeRef.current = 0;
    if (videoRef.current) {
      if (!videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    updateVideoTime(time, true);
  };

  // Handle input event - fires continuously while dragging
  const handleSeekInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    // Update immediately on every input event - no throttling
    updateVideoTime(time, true);
  };

  const handleSeekEnd = () => {
    isDraggingRef.current = false;
    lastSeekTimeRef.current = 0;
    
    // Cancel any pending RAF
    if (rafSeekRef.current !== null) {
      cancelAnimationFrame(rafSeekRef.current);
      rafSeekRef.current = null;
    }
    
    // Ensure final position is set immediately
    if (seekRef.current !== null && videoRef.current) {
      const finalTime = seekRef.current;
      videoRef.current.currentTime = finalTime;
      setCurrentTime(finalTime);
    }
    
    setTimeout(() => {
      setIsSeeking(false);
      seekRef.current = null;
    }, 100);
  };

  return (
    <div 
      ref={containerRef} 
      className={`
        relative bg-black rounded-2xl overflow-hidden border border-white/5 group/video select-none
        ${isFullscreen ? 'fixed inset-0 z-[100] flex flex-col justify-center bg-black h-screen w-screen rounded-none border-none' : 'aspect-video w-full'}
        ${className}
      `}
      style={isFullscreen ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 } : undefined}
      onDoubleClick={toggleFullscreen}
    >
      {/* Video Layer */}
      {isLoading ? (
        <div className="w-full h-full flex items-center justify-center bg-black/50">
          <div className="text-white/60">Loading video...</div>
        </div>
      ) : !videoSrc ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black/50 gap-3 p-6">
          <div className="text-white/80 font-medium">Video unavailable</div>
          <div className="text-white/50 text-sm text-center max-w-md">
            This video is no longer available. It may have been from a previous session before video storage was implemented.
          </div>
        </div>
       ) : (
         <video
           ref={videoRef}
           src={videoSrc}
           className={`w-full h-full object-contain ${isFullscreen ? 'max-h-screen' : ''}`}
           playsInline
           preload="metadata"
           onLoadedMetadata={(e) => {
             const video = e.currentTarget;
             if (video.duration && isFinite(video.duration)) {
               setDuration(video.duration);
             }
           }}
           onLoadedData={(e) => {
             const video = e.currentTarget;
             if (video.duration && isFinite(video.duration) && duration === 0) {
               setDuration(video.duration);
             }
           }}
           onCanPlay={(e) => {
             const video = e.currentTarget;
             if (video.duration && isFinite(video.duration) && duration === 0) {
               setDuration(video.duration);
             }
           }}
         />
       )}

      {/* Canvas Layer */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 z-10 w-full h-full touch-none ${isAnnotating ? 'cursor-crosshair' : 'pointer-events-none'}`}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        style={{ pointerEvents: isAnnotating ? 'auto' : 'none' }}
      />

      {/* Annotation Display (Playback Mode) - Always visible if annotations exist */}
      {!isAnnotating && annotationsWithDrawings.length > 0 && (
        <div className="absolute top-2 sm:top-3 md:top-4 left-2 sm:left-3 md:left-4 z-20 annotation-dropdown-container max-w-[calc(100%-1rem)] sm:max-w-none">
          {annotationsWithDrawings.length === 1 ? (
            // Single annotation - clickable to seek
            <div 
              onClick={() => seekToAnnotation(annotationsWithDrawings[0])}
              className="bg-black/50 backdrop-blur-md border border-sequence-orange/50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg flex items-center gap-1.5 sm:gap-2 animate-in fade-in shadow-lg group/annotation cursor-pointer hover:bg-black/70 transition-colors touch-manipulation"
            >
              <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-sequence-orange flex-shrink-0 ${activeDisplayAnnotation ? 'animate-pulse' : ''} shadow-[0_0_8px_rgba(249,115,22,0.8)]`} />
              <span className="text-[10px] sm:text-xs font-mono text-white font-medium tracking-wide truncate">
                <span className="hidden xs:inline">Analysis at </span>{formatTime(annotationsWithDrawings[0].startTime ?? annotationsWithDrawings[0].timestamp)}
              </span>
              {onDeleteAnnotation && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAnnotation(annotationsWithDrawings[0].id);
                  }}
                  className="ml-1 p-1 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors opacity-0 group-hover/annotation:opacity-100 touch-manipulation min-w-[28px] min-h-[28px] flex items-center justify-center flex-shrink-0"
                  title="Delete analysis"
                >
                  <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" strokeWidth={2.5} />
                </button>
              )}
            </div>
          ) : (
            // Multiple annotations - dropdown
            <div className="relative">
              <button
                onClick={() => setAnnotationDropdownOpen(!annotationDropdownOpen)}
                className="bg-black/50 backdrop-blur-md border border-sequence-orange/50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg flex items-center gap-1.5 sm:gap-2 animate-in fade-in shadow-lg hover:bg-black/70 transition-colors touch-manipulation"
              >
                <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-sequence-orange flex-shrink-0 ${activeDisplayAnnotation ? 'animate-pulse' : ''} shadow-[0_0_8px_rgba(249,115,22,0.8)]`} />
                <span className="text-[10px] sm:text-xs font-mono text-white font-medium tracking-wide">
                  {annotationsWithDrawings.length} {annotationsWithDrawings.length === 1 ? 'Analysis' : 'Analyses'}
                </span>
                <ChevronDown className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-white transition-transform flex-shrink-0 ${annotationDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {annotationDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 bg-black/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl min-w-[180px] sm:min-w-[200px] max-w-[calc(100vw-2rem)] max-h-[250px] sm:max-h-[300px] overflow-y-auto z-30">
                  {annotationsWithDrawings.map((ann) => {
                    const isActive = activeAnnotations.some(a => a.id === ann.id);
                    return (
                      <div
                        key={ann.id}
                        className={`px-2.5 sm:px-3 py-1.5 sm:py-2 hover:bg-white/10 transition-colors flex items-center justify-between group/item touch-manipulation min-h-[44px] ${isActive ? 'bg-sequence-orange/10' : ''}`}
                      >
                        <button
                          onClick={() => seekToAnnotation(ann)}
                          className="flex items-center gap-1.5 sm:gap-2 flex-1 text-left min-w-0"
                        >
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-sequence-orange animate-pulse' : 'bg-sequence-orange/60'}`} />
                          <span className="text-[10px] sm:text-xs font-mono text-white truncate">
                            {formatTime(ann.startTime ?? ann.timestamp)}
                          </span>
                        </button>
                        {onDeleteAnnotation && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteAnnotation(ann.id);
                            }}
                            className="p-1 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors opacity-0 group-hover/item:opacity-100 touch-manipulation min-w-[28px] min-h-[28px] flex items-center justify-center flex-shrink-0 ml-1"
                            title="Delete analysis"
                          >
                            <X className="w-3 h-3" strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Annotation UI (Drawing Mode) */}
      {isAnnotating && (
        <>
          {/* Left Sidebar - Undo/Redo/Clear */}
          <div className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 sm:gap-2 z-30">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className={`p-2 sm:p-2.5 rounded-lg transition-all touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center ${
                historyIndex > 0
                  ? 'bg-[#121212]/95 backdrop-blur-xl border border-white/10 text-white hover:bg-white/10 shadow-lg active:scale-95'
                  : 'bg-[#121212]/50 text-neutral-600 cursor-not-allowed opacity-50'
              }`}
              title="Undo"
            >
              <Undo2 className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= drawingHistory.length - 1}
              className={`p-2 sm:p-2.5 rounded-lg transition-all touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center ${
                historyIndex < drawingHistory.length - 1
                  ? 'bg-[#121212]/95 backdrop-blur-xl border border-white/10 text-white hover:bg-white/10 shadow-lg active:scale-95'
                  : 'bg-[#121212]/50 text-neutral-600 cursor-not-allowed opacity-50'
              }`}
              title="Redo"
            >
              <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
            </button>
            <button
              onClick={handleClear}
              className="p-2 sm:p-2.5 rounded-lg bg-[#121212]/95 backdrop-blur-xl border border-white/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all shadow-lg touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95"
              title="Clear all"
            >
              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
            </button>
          </div>

          {/* Right Sidebar - Duration, Tools and Colors Panel */}
          <div className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2 items-end">
            {/* Duration Controls - Compact */}
            <div className="bg-[#121212]/95 backdrop-blur-xl border border-white/10 rounded-lg px-1.5 py-1 shadow-xl">
              <div className="flex items-center gap-1 text-[9px] sm:text-[10px]">
                <span className="text-neutral-400 whitespace-nowrap">Show:</span>
                <input
                  type="number"
                  min="1"
                  max={duration ? Math.floor(duration) : 300}
                  value={annotationDurationInput || ''}
                  onChange={(e) => {
                    const inputVal = e.target.value;
                    setAnnotationDurationInput(inputVal);
                    // Only update annotationDuration if it's a valid number
                    if (inputVal === '') {
                      setAnnotationDuration(null);
                    } else {
                      const numVal = parseFloat(inputVal);
                      if (!isNaN(numVal) && numVal > 0) {
                        setAnnotationDuration(numVal);
                      }
                    }
                  }}
                  onBlur={() => {
                    // If empty on blur, set to default
                    if (annotationDurationInput === '') {
                      const defaultDuration = duration ? Math.floor(duration) : 10;
                      setAnnotationDurationInput(defaultDuration.toString());
                      setAnnotationDuration(defaultDuration);
                    }
                  }}
                  className="w-10 px-1 py-0.5 bg-black/50 border border-white/10 rounded text-white text-[9px] sm:text-[10px] focus:outline-none focus:border-sequence-orange/50 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-neutral-400">s</span>
              </div>
            </div>

            <div className="relative color-picker-container">
              <div className="bg-[#121212]/95 backdrop-blur-xl border border-white/10 rounded-xl p-1 sm:p-1.5 flex flex-col gap-2 sm:gap-2.5 shadow-2xl">
                {/* Tool Selector */}
                <div className="flex flex-col gap-0.5 sm:gap-1">
                  {[
                    { id: 'pen', icon: Pencil },
                    { id: 'line', icon: MoveDiagonal },
                    { id: 'arrow', icon: ArrowRight },
                    { id: 'circle', icon: CircleIcon },
                    { id: 'angle', icon: ProtractorIcon },
                  ].map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => {
                          setActiveTool(tool.id as DrawingTool);
                          setAnglePoints([]);
                      }}
                      className={`p-2 sm:p-2.5 rounded-lg transition-all touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95 ${
                        activeTool === tool.id 
                          ? 'bg-sequence-orange text-white shadow-lg shadow-orange-900/20' 
                          : 'text-neutral-400 hover:text-white hover:bg-white/10'
                      }`}
                      title={tool.id.charAt(0).toUpperCase() + tool.id.slice(1)}
                    >
                      <tool.icon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div className="h-px bg-white/10"></div>

                {/* Color Picker Button */}
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setColorPickerOpen(!colorPickerOpen)}
                    className="p-2 sm:p-2.5 rounded-lg transition-all hover:bg-white/10 flex items-center justify-center"
                    title="Select color"
                  >
                    <div 
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-white shadow-md"
                      style={{ backgroundColor: selectedColor }}
                    />
                  </button>
                </div>
              </div>
              
              {/* Color Options - Single Column to the Left */}
              {colorPickerOpen && (
                <div className="absolute right-full mr-2 top-0 bg-[#121212]/95 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 flex flex-col gap-1.5 shadow-xl z-40 animate-in fade-in slide-in-from-right-2">
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        setSelectedColor(color);
                        setColorPickerOpen(false);
                      }}
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 transition-all duration-200 ${
                        selectedColor === color ? 'border-white scale-110 shadow-md' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Bar - Save/Cancel */}
          <div className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 sm:gap-2.5 z-30 w-full px-2 sm:px-4 max-w-xl">
            {/* Action Buttons */}
            <div className="flex gap-2 sm:gap-3 w-full max-w-md justify-center">
              <button 
                onClick={exitAnnotationMode}
                className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold bg-black/70 text-white backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all touch-manipulation min-h-[44px] flex-1 sm:flex-initial active:scale-95"
              >
                Cancel
              </button>
              <button 
                onClick={saveAnnotation}
                className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold bg-sequence-orange text-white shadow-lg shadow-orange-600/20 hover:bg-sequence-orangeHover transition-all hover:scale-105 hover:shadow-orange-600/40 flex items-center justify-center gap-1.5 touch-manipulation min-h-[44px] flex-1 sm:flex-initial active:scale-95"
              >
                <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
                <span className="hidden xs:inline">Save Analysis</span>
                <span className="xs:hidden">Save</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Playback Controls (Playback Mode) */}
      {!isAnnotating && (
        <div className={`
           absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-16 sm:pt-20 md:pt-24 pb-3 sm:pb-4 md:pb-5 px-3 sm:px-4 md:px-6 transition-all duration-500 z-20
           ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}
        `}>
          {/* Timeline Scrubber */}
          <div 
            ref={scrubberRef}
            className="relative w-full h-1.5 sm:h-1 bg-white/20 rounded-full mb-4 sm:mb-5 md:mb-6 cursor-pointer group/scrubber hover:h-2 sm:hover:h-1.5 transition-all duration-300 touch-manipulation"
            onMouseDown={handleScrubberMouseDown}
            onTouchStart={handleScrubberMouseDown}
          >
            <input
              type="range"
              min={0}
              max={duration && duration > 0 ? duration : 100}
              step={0.001}
              value={currentTime}
              disabled={!duration || duration === 0}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleSeekStart();
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                handleSeekStart();
              }}
              onChange={handleSeek}
              onInput={handleSeekInput}
              onMouseUp={(e) => {
                e.stopPropagation();
                handleSeekEnd();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                handleSeekEnd();
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
            />
            {/* Progress */}
            <div 
              className="h-full bg-sequence-orange rounded-full relative" 
              style={{ width: `${(currentTime / duration) * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full scale-0 group-hover/scrubber:scale-100 transition-transform shadow-lg border-2 border-sequence-orange" />
            </div>

            {/* Annotation Markers */}
            {annotations.map((ann, idx) => (
              <div 
                key={ann.id || idx}
                className="absolute top-1/2 -translate-y-1/2 z-0 group/marker"
                style={{ left: `${(ann.timestamp / duration) * 100}%` }}
              >
                <div className="w-2.5 h-2.5 bg-sequence-orange border-2 border-black rounded-full transform transition-transform group-hover/scrubber:scale-125 group-hover/marker:scale-150" />
                {onDeleteAnnotation && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAnnotation(ann.id);
                    }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-6 p-1 rounded-full bg-red-500/90 hover:bg-red-500 text-white opacity-0 group-hover/marker:opacity-100 transition-opacity shadow-lg z-10"
                    title="Delete analysis"
                  >
                    <X className="w-2.5 h-2.5" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-3 sm:gap-4 md:gap-5 min-w-0">
              <button 
                onClick={togglePlay}
                className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all shadow-lg hover:bg-gray-100 touch-manipulation flex-shrink-0"
              >
                {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5 sm:ml-1" />}
              </button>
              
              <div className="flex flex-col min-w-0">
                 <div className="text-xs sm:text-sm font-bold font-mono text-white tracking-widest shadow-black drop-shadow-md whitespace-nowrap">
                    {formatTime(currentTime)} <span className="text-white/40 font-normal hidden sm:inline">/ {formatTime(duration)}</span>
                 </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0">
              {/* Toggle Annotations Button */}
              {annotations.length > 0 && (
                <button
                  onClick={() => setShowAnnotations(!showAnnotations)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-full backdrop-blur-md border transition-all duration-300 touch-manipulation min-h-[36px] sm:min-h-[40px] ${
                    showAnnotations
                      ? 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                      : 'bg-black/40 border-white/10 text-neutral-400 hover:text-white hover:border-white/20'
                  }`}
                  title={showAnnotations ? 'Hide annotations' : 'Show annotations'}
                >
                  {showAnnotations ? (
                    <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                  <span className="text-[10px] sm:text-xs font-medium hidden xs:inline">
                    {showAnnotations ? 'Hide' : 'Show'}
                  </span>
                </button>
              )}

              {/* Analyze Button */}
              <button
                onClick={enterAnnotationMode}
                className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 md:py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white hover:bg-sequence-orange hover:border-sequence-orange hover:shadow-lg hover:shadow-orange-900/20 transition-all duration-300 group/analyze touch-manipulation min-h-[36px] sm:min-h-[40px] active:scale-95"
              >
                 <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover/analyze:animate-bounce" />
                 <span className="text-xs sm:text-sm font-semibold tracking-wide hidden xs:inline">Draw</span>
              </button>

              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="p-2 sm:p-2.5 md:p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors backdrop-blur-sm relative z-50 touch-manipulation min-w-[36px] min-h-[36px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center"
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
