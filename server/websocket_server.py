from geventwebsocket import WebSocketServer, WebSocketApplication, Resource
import threading
import time
import queue

connected_clients = []
message_queue = queue.Queue()  # Thread-safe queue for handling messages

class WebSocketApp(WebSocketApplication):
    def on_open(self):
        connected_clients.append(self.ws)
        print("New WebSocket connection established")
    
    def on_message(self, message):
        if message:
            print(f"Received: {message}")
            self.ws.send(f"Echo: {message}")

    def on_close(self, reason):
        print("WebSocket connection closed")
        connected_clients.remove(self.ws)

    def keep_alive(self):
        while not self.ws.closed:
            try:
                self.ws.send('ping')
                time.sleep(30)  # Ping every 30 seconds
            except Exception as e:
                print(f"Error sending ping: {e}")
                break

# Function to start the WebSocket server in a separate thread
def websocket_server():
    resource = Resource([('/', WebSocketApp)])
    ws_server = WebSocketServer(('0.0.0.0', 5002), resource)
    ws_server.serve_forever()

# Function to send messages from the queue to WebSocket clients
def send_message_from_queue():
    while True:
        try:
            command = message_queue.get()
            for ws in connected_clients:
                if not ws.closed:
                    ws.send(command)
                    print(f"Sent: {command}")
        except Exception as e:
            print(f"Error sending message: {e}")
        time.sleep(1)

# Start both WebSocket server and message handling threads
def start_websocket_server():
    websocket_thread = threading.Thread(target=websocket_server)
    websocket_thread.start()

    message_sending_thread = threading.Thread(target=send_message_from_queue)
    message_sending_thread.start()
