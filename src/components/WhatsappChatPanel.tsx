'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/firebaseConfig';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  type Timestamp,
} from 'firebase/firestore';
import {
  MessageSquare,
  Send,
  User,
  Bot,
  Loader2,
  ChevronRight
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Skeleton } from './ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from './ui/scroll-area';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';

// Types
type Message = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

type ChatSummary = {
  id: string; // Phone number
  ultima_interaccion?: Timestamp;
  lastMessage?: string;
};

type Chat = {
  mensajes: Message[];
  ultima_interaccion: Timestamp;
};


export const WhatsappChatPanel: React.FC = () => {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [isChatListLoading, setIsChatListLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedChat]);

  // Fetch chat list
  useEffect(() => {
    const q = query(collection(db, 'whatsapp_chats'), orderBy('ultima_interaccion', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const chatList = snapshot.docs.map((d) => {
            const data = d.data();
            const lastMsg = data.mensajes?.[data.mensajes.length - 1]?.parts?.[0]?.text || '...';
            return { 
                id: d.id, 
                ultima_interaccion: data.ultima_interaccion,
                lastMessage: lastMsg.length > 40 ? `${lastMsg.substring(0, 40)}...` : lastMsg,
            } as ChatSummary
        });
        setChats(chatList);
        setIsChatListLoading(false);
      },
      (err) => {
        console.error('Error fetching chat list:', err);
        setIsChatListLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch selected chat details
  useEffect(() => {
    if (!selectedChatId) {
        setSelectedChat(null);
        return;
    };

    setIsChatLoading(true);
    const chatDocRef = doc(db, 'whatsapp_chats', selectedChatId);

    const unsubscribe = onSnapshot(chatDocRef, (doc) => {
        if(doc.exists()){
            setSelectedChat(doc.data() as Chat);
        } else {
            setSelectedChat(null);
        }
        setIsChatLoading(false);
    }, (err) => {
        console.error('Error fetching chat:', err);
        setIsChatLoading(false);
    })

    return () => unsubscribe();

  }, [selectedChatId]);

  const formatTimestamp = (timestamp?: Timestamp) => {
    if (!timestamp) return '';
    return formatDistanceToNow(timestamp.toDate(), { addSuffix: true, locale: es });
  };

  return (
    <Card className="h-[calc(100vh-10rem)] w-full flex flex-col">
        <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
                <MessageSquare /> WhatsApp Chats
            </CardTitle>
            <CardDescription>
                Visualiza las conversaciones recientes del bot de WhatsApp.
            </CardDescription>
        </CardHeader>
        <CardContent className="flex-grow p-0 flex min-h-0">
            <aside className="w-1/3 border-r min-h-0 flex flex-col">
                <div className='p-4 border-b'>
                    <h3 className="font-semibold">Conversaciones</h3>
                </div>
                <ScrollArea className="flex-grow">
                    {isChatListLoading ? (
                        <div className="p-4 space-y-3">
                            <Skeleton className="h-14 w-full" />
                            <Skeleton className="h-14 w-full" />
                            <Skeleton className="h-14 w-full" />
                        </div>
                    ) : chats.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">No hay chats.</div>
                    ) : (
                        <div>
                            {chats.map(chat => (
                                <button key={chat.id} onClick={() => setSelectedChatId(chat.id)} className={cn("w-full text-left p-4 border-b hover:bg-accent/50 transition-colors flex items-center gap-4", selectedChatId === chat.id && "bg-accent")}>
                                    <Avatar className='h-9 w-9'>
                                        <AvatarFallback><User className='h-4 w-4'/></AvatarFallback>
                                    </Avatar>
                                    <div className="flex-grow truncate">
                                        <div className="flex justify-between items-baseline">
                                            <p className="font-semibold truncate">{chat.id}</p>
                                            <p className="text-xs text-muted-foreground whitespace-nowrap">{formatTimestamp(chat.ultima_interaccion)}</p>
                                        </div>
                                        <p className="text-sm text-muted-foreground truncate">{chat.lastMessage}</p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </aside>
            <main className="w-2/3 flex flex-col min-h-0">
                {!selectedChatId ? (
                    <div className="flex-grow flex items-center justify-center text-muted-foreground">
                        <p>Selecciona un chat para ver la conversación.</p>
                    </div>
                ) : isChatLoading ? (
                    <div className="flex-grow flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : !selectedChat ? (
                     <div className="flex-grow flex items-center justify-center text-destructive">
                        <p>No se pudo cargar el chat.</p>
                    </div>
                ) : (
                    <>
                        <div className="p-4 border-b flex items-center gap-3">
                            <Avatar>
                                <AvatarFallback>{selectedChatId.substring(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <h3 className="font-semibold">{selectedChatId}</h3>
                                <p className="text-xs text-muted-foreground">Última actividad: {formatTimestamp(selectedChat.ultima_interaccion)}</p>
                            </div>
                        </div>
                        <ScrollArea className="flex-grow bg-slate-50/50 p-4">
                            <div className="space-y-4">
                                {selectedChat.mensajes.map((msg, index) => (
                                    <div key={index} className={cn("flex items-end gap-2", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                                         {msg.role === 'model' && (
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className='bg-primary text-primary-foreground'><Bot className='h-4 w-4'/></AvatarFallback>
                                            </Avatar>
                                        )}
                                        <div className={cn(
                                            "max-w-md rounded-lg p-3 text-sm",
                                            msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-card border rounded-bl-none'
                                        )}>
                                            <p className='whitespace-pre-wrap'>{msg.parts[0]?.text}</p>
                                        </div>
                                        {msg.role === 'user' && (
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback><User className='h-4 w-4'/></AvatarFallback>
                                            </Avatar>
                                        )}
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                        </ScrollArea>
                        <div className="p-4 border-t bg-card">
                            {/* The user might want to send messages later, so I'll leave a disabled input */}
                            <div className="relative">
                                <Input placeholder="La respuesta es automática desde el bot." disabled/>
                                <Button size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" disabled>
                                    <Send className="h-4 w-4"/>
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </CardContent>
    </Card>
  );
};
