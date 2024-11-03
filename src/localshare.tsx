import { useEffect, useState } from "react";
import { List, ActionPanel, Action, Icon, showToast, Toast } from "@raycast/api";
import { io, Socket } from "socket.io-client";
import QRCode from "qrcode";
import { networkInterfaces } from "os";

interface Message {
  type: "text" | "file";
  content: string;
  timestamp: number;
  direction: "sent" | "received";
}

export default function Command() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [qrCode, setQRCode] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isServerStarting, setIsServerStarting] = useState(true);

  useEffect(() => {
    const initializeServer = async () => {
      try {
        setIsServerStarting(true);
        // const serverManager = ServerManager.getInstance();
        // await serverManager.startServer();
        
        initializeSocket();
        
        return () => {
          if (socket) {
            socket.disconnect();
          }
          // serverManager.stopServer();
        };
      } catch (error) {
        console.error("Server initialization error:", error);
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to start server",
          message: "Please check console for details",
        });
      } finally {
        setIsServerStarting(false);
      }
    };

    initializeServer();
  }, []);

  const initializeSocket = () => {
    try {
      const newSocket = io("http://localhost:3000", {
        reconnection: true,
        reconnectionAttempts: 5,
        timeout: 10000,
      });

      newSocket.on("connect", () => {
        setIsConnected(true);
        showToast({
          style: Toast.Style.Success,
          title: "Connected to server",
        });

        const localIP = getLocalIP();
        QRCode.toDataURL(`http://${localIP}:3000`)
          .then(setQRCode)
          .catch(console.error);
      });

      newSocket.on("connect_error", (error) => {
        console.error("Connection error:", error);
        showToast({
          style: Toast.Style.Failure,
          title: "Connection failed",
          message: "Retrying...",
        });
      });

      newSocket.on("message", (message: Message) => {
        setMessages((prev) => [...prev, { ...message, direction: "received" }]);
      });

      setSocket(newSocket);
    } catch (error) {
      console.error("Socket initialization error:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to initialize connection",
      });
    }
  };

  const sendMessage = (content: string, type: "text" | "file") => {
    if (!socket?.connected) {
      showToast({
        style: Toast.Style.Failure,
        title: "Not connected",
        message: "Waiting for connection...",
      });
      return;
    }

    const message: Message = {
      type,
      content,
      timestamp: Date.now(),
      direction: "sent",
    };

    socket.emit("message", message);
    setMessages((prev) => [...prev, message]);
  };

  return (
    <List
      isLoading={isServerStarting}
      searchBarPlaceholder="Type message to send..."
      onSearchTextChange={(text) => {
        if (text) {
          sendMessage(text, "text");
        }
      }}
    >
      <List.Section title="Status">
        <List.Item
          title={isServerStarting ? "Starting server..." : isConnected ? "Connected" : "Waiting for connection"}
          icon={isConnected ? Icon.CheckCircle : Icon.Circle}
          accessories={[{ text: getLocalIP() }]}
        />
        {qrCode && (
          <List.Item
            title="Scan QR Code to connect"
            detail={
              <List.Item.Detail 
                markdown={qrCode ? `![QR Code](${qrCode})` : "Generating QR code..."}
              />
            }
          />
        )}
      </List.Section>

      <List.Section title="Messages">
        {messages.map((message, index) => (
          <List.Item
            key={index}
            title={message.content}
            icon={message.direction === "sent" ? Icon.ArrowRight : Icon.ArrowLeft}
            accessories={[{ text: new Date(message.timestamp).toLocaleTimeString() }]}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard content={message.content} />
                {message.type === "file" && <Action.OpenWith path={message.content} />}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const net = nets[name];
    if (!net) continue;
    
    for (const interface_ of net) {
      if (interface_.family === "IPv4" && !interface_.internal) {
        return interface_.address;
      }
    }
  }
  return "localhost";
}
