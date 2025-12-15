import React, { useRef, useEffect, useState } from 'react';
import { Message, MessageType, User, UserRole, Annotation } from '../types';
import { format } from 'date-fns';
import { Play, Send, Video, Mic, X } from 'lucide-react';
import { VideoPlayer } from './VideoPlayer';
import { generateVideoThumbnail } from '../utils/videoThumbnail';
import { storeVideo, getVideo } from '../utils/videoStorage';

interface ChatInterfaceProps {
  messages: Message[];
  currentUser: User;
  onSendMessage: (content: string, type: MessageType, metadata?: Message['metadata']) => void;
  onUpdateMessage: (messageId: string, updates: Partial<Message>) => void;
  otherUserName?: string; // Name of the other user (admin or user)
}

interface PendingAttachment {
  type: 'video' | 'audio';
  url: string; // blob URL for preview
  blob: Blob; // original blob for conversion to base64
  metadata?: {
    duration?: number;
    thumbnailUrl?: string;
    fileSize?: string;
  };
}


// Helper function to get two initials from a name
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    // Multiple words: first letter of first word + first letter of last word
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  } else if (parts.length === 1 && parts[0].length >= 2) {
    // Single word with 2+ characters: first two letters
    return parts[0].substring(0, 2).toUpperCase();
  } else {
    // Single character: just that character
    return parts[0].charAt(0).toUpperCase();
  }
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, currentUser, onSendMessage, onUpdateMessage, otherUserName = 'Admin' }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef<boolean>(false);
  const [inputValue, setInputValue] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<{ [key: string]: { current: number; duration: number } }>({});
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});


  const handleSend = async () => {
    // Mark that we should scroll when the new message arrives
    shouldScrollRef.current = true;
    
    // If there's a pending attachment, send it (with optional text)
    if (pendingAttachment) {
      const messageType = pendingAttachment.type === 'video' ? MessageType.VIDEO : MessageType.AUDIO;
      
      // Store the blob (will use IndexedDB for large files, data URL for small ones)
      try {
        const storageKey = await storeVideo(pendingAttachment.blob);
        onSendMessage(storageKey, messageType, pendingAttachment.metadata);
      } catch (error) {
        console.error('Error storing video:', error);
        // Fallback: send blob URL (won't persist but will work in current session)
        onSendMessage(pendingAttachment.url, messageType, pendingAttachment.metadata);
      }
      
      // Clean up the object URL
      URL.revokeObjectURL(pendingAttachment.url);
      if (pendingAttachment.metadata?.thumbnailUrl && pendingAttachment.metadata.thumbnailUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pendingAttachment.metadata.thumbnailUrl);
      }
      setPendingAttachment(null);
    }
    
    // If there's text, send it as a separate text message
    if (inputValue.trim()) {
      onSendMessage(inputValue, MessageType.TEXT);
      setInputValue('');
    }
  };

  const handleRemoveAttachment = () => {
    if (pendingAttachment) {
      // Clean up the object URL (only if it's a blob URL)
      if (pendingAttachment.url.startsWith('blob:')) {
        URL.revokeObjectURL(pendingAttachment.url);
      }
      // Thumbnails are already data URLs from generateVideoThumbnail, no need to revoke
      setPendingAttachment(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && (inputValue.trim() || pendingAttachment)) {
      e.preventDefault();
      handleSend();
    }
  };


  const handleAddAnnotation = (messageId: string, annotation: Annotation) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const currentAnnotations = message.metadata?.annotations || [];
    const newAnnotations = [...currentAnnotations, annotation].sort((a, b) => a.timestamp - b.timestamp);
    
    onUpdateMessage(messageId, {
      metadata: {
        ...message.metadata,
        annotations: newAnnotations
      }
    });
  };

  const handleDeleteAnnotation = (messageId: string, annotationId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const currentAnnotations = message.metadata?.annotations || [];
    const newAnnotations = currentAnnotations.filter(ann => ann.id !== annotationId);
    
    onUpdateMessage(messageId, {
      metadata: {
        ...message.metadata,
        annotations: newAnnotations
      }
    });
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Remove any existing pending attachment
    handleRemoveAttachment();

    // Create object URL for the video
    const videoUrl = URL.createObjectURL(file);
    
    try {
      // Generate thumbnail
      const thumbnailUrl = await generateVideoThumbnail(videoUrl);
      
      // Get video duration
      const video = document.createElement('video');
      video.src = videoUrl;
      await new Promise((resolve) => {
        video.onloadedmetadata = () => resolve(undefined);
      });
      const duration = video.duration;

      // Store as pending attachment instead of sending
      setPendingAttachment({
        type: 'video',
        url: videoUrl,
        blob: file,
        metadata: {
          thumbnailUrl,
          duration,
          fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`
        }
      });
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      // Still store the video even if thumbnail generation fails
      setPendingAttachment({
        type: 'video',
        url: videoUrl,
        blob: file,
        metadata: {
          fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`
        }
      });
    }
    
    // Reset input
    e.target.value = '';
  };

  const handleAudioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Remove any existing pending attachment
    handleRemoveAttachment();

    const audioUrl = URL.createObjectURL(file);
    
    try {
      // Get audio duration
      const audio = document.createElement('audio');
      audio.src = audioUrl;
      await new Promise((resolve) => {
        audio.onloadedmetadata = () => resolve(undefined);
      });
      const duration = audio.duration;

      // Store as pending attachment instead of sending
      setPendingAttachment({
        type: 'audio',
        url: audioUrl,
        blob: file,
        metadata: {
          duration,
          fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`
        }
      });
    } catch (error) {
      console.error('Error processing audio:', error);
      // Still store the audio even if processing fails
      setPendingAttachment({
        type: 'audio',
        url: audioUrl,
        blob: file,
        metadata: {
          fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`
        }
      });
    }
    
    // Reset input
    e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Remove any existing pending attachment (clean up old URLs)
        setPendingAttachment(prev => {
          if (prev) {
            URL.revokeObjectURL(prev.url);
            if (prev.metadata?.thumbnailUrl && prev.metadata.thumbnailUrl.startsWith('blob:')) {
              URL.revokeObjectURL(prev.metadata.thumbnailUrl);
            }
          }
          return null;
        });
        
        // Get audio duration
        const audio = document.createElement('audio');
        audio.src = audioUrl;
        audio.onloadedmetadata = () => {
          const duration = audio.duration;
          // Store as pending attachment instead of sending
          setPendingAttachment({
            type: 'audio',
            url: audioUrl,
            blob: audioBlob,
            metadata: {
              duration,
              fileSize: `${(audioBlob.size / 1024 / 1024).toFixed(1)} MB`
            }
          });
        };
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start recording timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      setRecordingTime(0);
    }
  };

  const handleVoiceButtonClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleAudioPlay = (messageId: string, audioUrl: string, duration?: number) => {
    // Stop any currently playing audio
    Object.values(audioRefs.current).forEach(audio => {
      if (audio && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    if (playingAudioId === messageId) {
      // If clicking the same audio, pause it
      const audio = audioRefs.current[messageId];
      if (audio) {
        audio.pause();
      }
      setPlayingAudioId(null);
      return;
    }

    // Create or get audio element
    if (!audioRefs.current[messageId]) {
      const audio = new Audio(audioUrl);
      audioRefs.current[messageId] = audio;
      
      audio.onloadedmetadata = () => {
        const dur = audio.duration;
        setAudioProgress(prev => ({
          ...prev,
          [messageId]: { current: 0, duration: dur || duration || 0 }
        }));
      };
      
      audio.ontimeupdate = () => {
        setAudioProgress(prev => ({
          ...prev,
          [messageId]: { 
            current: audio.currentTime, 
            duration: prev[messageId]?.duration || audio.duration || duration || 0 
          }
        }));
      };
      
      audio.onended = () => {
        setPlayingAudioId(null);
        setAudioProgress(prev => ({
          ...prev,
          [messageId]: { current: 0, duration: prev[messageId]?.duration || 0 }
        }));
      };
    }

    const audio = audioRefs.current[messageId];
    
    // Set initial duration if available
    if (duration && !audioProgress[messageId]) {
      setAudioProgress(prev => ({
        ...prev,
        [messageId]: { current: 0, duration }
      }));
    }
    
    audio.play();
    setPlayingAudioId(messageId);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Auto-scroll to bottom only when messages are sent
  useEffect(() => {
    if (shouldScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      shouldScrollRef.current = false;
    }
  }, [messages]);

  // Initial scroll to bottom on mount (if messages exist)
  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      // Use setTimeout to ensure DOM is fully rendered
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 0);
    }
  }, []); // Only run on mount

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
      // Cleanup audio elements
      Object.values(audioRefs.current).forEach(audio => {
        if (audio) {
          audio.pause();
          audio.src = '';
        }
      });
      // Cleanup pending attachment URLs
      if (pendingAttachment) {
        URL.revokeObjectURL(pendingAttachment.url);
        if (pendingAttachment.metadata?.thumbnailUrl && pendingAttachment.metadata.thumbnailUrl.startsWith('blob:')) {
          URL.revokeObjectURL(pendingAttachment.metadata.thumbnailUrl);
        }
      }
    };
  }, [isRecording, pendingAttachment]);

  return (
    <div className="flex flex-col h-full bg-[#050505] relative overflow-hidden">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pt-0 pb-3 sm:pb-4 md:pb-6 space-y-4 sm:space-y-6 scroll-smooth" ref={scrollRef} style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
        {/* Date Divider */}
        <div className="flex justify-center pt-3 pb-4">
          <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest bg-neutral-900/50 px-3 py-1 rounded-full border border-white/5 backdrop-blur-sm">
            Today
          </span>
        </div>

        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser.id;
          const isVideo = msg.type === MessageType.VIDEO;
          
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-2 duration-500`}>
              <div className={`flex gap-2 sm:gap-3 max-w-full ${isVideo ? 'w-full md:w-[95%] lg:w-[90%]' : 'max-w-[85%] sm:max-w-[90%] md:max-w-[75%]'} ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full shadow-lg border-2 ${isMe ? 'border-sequence-orange/20' : 'border-neutral-800'} overflow-hidden mt-auto mb-1 ${
                  isMe 
                    ? (currentUser.role === UserRole.COACH ? 'bg-gradient-to-br from-neutral-900 to-black' : 'bg-orange-500')
                    : (otherUserName === 'Admin' ? 'bg-gradient-to-br from-neutral-900 to-black' : 'bg-orange-500')
                } flex items-center justify-center text-white text-xs font-bold`}>
                  {isMe 
                    ? (currentUser.role === UserRole.COACH ? 'S' : getInitials(currentUser.name))
                    : (otherUserName === 'Admin' ? 'S' : getInitials(otherUserName))
                  }
                </div>

                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} w-full min-w-0`}>
                  {/* Sender Name */}
                  <span className={`text-[9px] sm:text-[10px] font-medium mb-1 sm:mb-1.5 px-1 ${isMe ? 'text-sequence-orange/80' : 'text-neutral-500'}`}>
                    {isMe ? currentUser.name : otherUserName} • {format(msg.createdAt, 'h:mm a')}
                  </span>

                  {/* Message Bubble */}
                  <div className={`overflow-hidden shadow-sm transition-all ${
                    isVideo 
                      ? 'w-full rounded-xl sm:rounded-2xl bg-black ring-1 ring-white/10' // Larger video container
                      : isMe
                        ? 'bg-gradient-to-br from-sequence-orange to-[#ea580c] text-white rounded-xl sm:rounded-2xl rounded-tr-sm shadow-orange-900/10' 
                        : 'bg-[#161616] ring-1 ring-white/5 text-gray-200 rounded-xl sm:rounded-2xl rounded-tl-sm'
                  }`}>
                    
                    {/* VIDEO TYPE */}
                    {msg.type === MessageType.VIDEO && (
                      <div className="w-full bg-black relative">
                         <VideoPlayer 
                            src={msg.content} 
                            annotations={msg.metadata?.annotations || []}
                            onAddAnnotation={(ann) => handleAddAnnotation(msg.id, ann)}
                            onDeleteAnnotation={(annotationId) => handleDeleteAnnotation(msg.id, annotationId)}
                         />
                      </div>
                    )}

                    {/* TEXT TYPE */}
                    {msg.type === MessageType.TEXT && (
                      <div className="px-3 sm:px-4 md:px-5 py-2.5 sm:py-3 md:py-3.5 text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap font-normal">
                        {msg.content}
                      </div>
                    )}

                    {/* AUDIO TYPE */}
                    {msg.type === MessageType.AUDIO && (() => {
                      const isPlaying = playingAudioId === msg.id;
                      const progress = audioProgress[msg.id] || { current: 0, duration: msg.metadata?.duration || 0 };
                      const progressPercent = progress.duration > 0 ? (progress.current / progress.duration) * 100 : 0;
                      
                      return (
                        <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3 min-w-[240px] sm:min-w-[280px]">
                          <button 
                            onClick={() => handleAudioPlay(msg.id, msg.content, msg.metadata?.duration)}
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all hover:scale-105 active:scale-95 touch-manipulation flex-shrink-0"
                          >
                            {isPlaying ? (
                              <div className="w-4 h-4 flex items-center justify-center gap-0.5">
                                <div className="w-1 h-3 bg-current rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                                <div className="w-1 h-3 bg-current rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                                <div className="w-1 h-3 bg-current rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                              </div>
                            ) : (
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            )}
                          </button>
                          <div className="flex-1 flex flex-col justify-center gap-1.5">
                            <div className="h-1 w-full bg-black/20 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-current rounded-full transition-all duration-100" 
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] font-mono opacity-60">
                              <span>{formatTime(progress.current)}</span>
                              <span>{formatTime(progress.duration)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

      </div>

      {/* Input Area - Unified Elite Design */}
      <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3 bg-gradient-to-t from-[#050505] via-[#0a0a0a] to-transparent border-t border-white/5 z-30 backdrop-blur-xl" style={{ 
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))'
      }}>
        <div className="max-w-full sm:max-w-2xl md:max-w-4xl mx-auto w-full px-2 sm:px-0">

          {/* Pending Attachment Preview - Compact */}
          {pendingAttachment && (
            <div className="relative bg-[#161616] ring-1 ring-white/10 rounded-xl p-2 mb-2 flex items-center gap-2">
              {pendingAttachment.type === 'video' && pendingAttachment.metadata?.thumbnailUrl && (
                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-black">
                  <img 
                    src={pendingAttachment.metadata.thumbnailUrl} 
                    alt="Video thumbnail" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Video className="w-3 h-3 text-white" />
                  </div>
                  {pendingAttachment.metadata.duration && (
                    <div className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[9px] px-1 py-0.5 rounded">
                      {formatTime(pendingAttachment.metadata.duration)}
                    </div>
                  )}
                </div>
              )}
              {pendingAttachment.type === 'audio' && (
                <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  <Mic className="w-5 h-5 text-neutral-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white font-medium">
                  {pendingAttachment.type === 'video' ? 'Video' : 'Audio'}
                </div>
                {pendingAttachment.metadata?.duration && (
                  <div className="text-[10px] text-neutral-400 mt-0.5">
                    {formatTime(pendingAttachment.metadata.duration)}
                  </div>
                )}
              </div>
              <button
                onClick={handleRemoveAttachment}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
                aria-label="Remove attachment"
              >
                <X className="w-3.5 h-3.5 text-neutral-400" />
              </button>
            </div>
          )}

          {/* Unified Input Bar */}
          <div className="relative flex items-center gap-1 sm:gap-1.5 bg-[#121212] ring-1 ring-white/10 rounded-lg sm:rounded-xl md:rounded-2xl p-1 sm:p-1.5 focus-within:ring-sequence-orange/50 focus-within:bg-[#161616] transition-all shadow-xl">
            {/* Left Side - Video & Voice Buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <label className="cursor-pointer p-2 rounded-xl hover:bg-white/10 transition-all touch-manipulation flex items-center justify-center">
                <Video className="w-4 h-4 text-neutral-400 hover:text-white transition-colors" />
                <input type="file" className="hidden" accept="video/*" onChange={handleVideoUpload} />
              </label>
              <button
                onClick={handleVoiceButtonClick}
                className={`p-2 rounded-xl transition-all touch-manipulation flex items-center justify-center ${
                  isRecording
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'hover:bg-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                <Mic className={`w-4 h-4 ${isRecording ? 'animate-pulse' : ''}`} />
                {isRecording && (
                  <span className="ml-1.5 text-xs font-medium">
                    {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}
                  </span>
                )}
              </button>
            </div>

            {/* Center - Text Input */}
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingAttachment ? `Add a message...` : `Type a message to ${otherUserName}...`}
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none outline-none text-white placeholder-neutral-500 resize-none max-h-32 py-2 min-h-[40px] text-base md:text-sm leading-relaxed"
              rows={1}
              style={{ height: 'auto', fontSize: '16px', outline: 'none' }} 
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = target.scrollHeight + 'px';
              }}
            />

            {/* Right Side - Send Button */}
            <button 
              onClick={handleSend}
              className={`p-2.5 rounded-xl transition-all duration-200 shadow-lg touch-manipulation flex items-center justify-center flex-shrink-0 ${
                (inputValue.trim() || pendingAttachment)
                  ? 'bg-sequence-orange text-white hover:bg-sequence-orangeHover shadow-orange-900/20' 
                  : 'text-neutral-600 bg-white/5 hover:bg-white/10'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
