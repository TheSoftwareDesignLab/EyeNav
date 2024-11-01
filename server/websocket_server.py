from geventwebsocket import WebSocketServer, WebSocketApplication, Resource
import threading
import time
import queue

connected_clients = []
message_queue = queue.Queue() 

class WebSocketApp(WebSocketApplication):
    def on_open(self):
        connected_clients.append(self.ws)
        print("INFO: New WebSocket connection established")
    
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
                time.sleep(30)  
            except Exception as e:
                print(f"Error sending ping: {e}")
                break


def websocket_server():
    port = 5002
    resource = Resource([('/', WebSocketApp)])
    ws_server = WebSocketServer(('0.0.0.0', port), resource)
    print(f"INFO: Starting WebSocket server on ws:// on port {port}")
    ws_server.serve_forever()


def send_message_from_queue():
    while True:
        try:
            command = message_queue.get()
            for ws in connected_clients:
                if not ws.closed:
                    ws.send(command)

        except Exception as e:
            print(f"Error sending message: {e}")
        time.sleep(1)


def start_websocket_server():
    websocket_thread = threading.Thread(target=websocket_server)
    websocket_thread.start()

    message_sending_thread = threading.Thread(target=send_message_from_queue)
    message_sending_thread.start()
