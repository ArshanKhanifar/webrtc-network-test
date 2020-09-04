from flask import Flask, jsonify, request
print("hello")
app = Flask(__name__)

counter = 0

@app.route('/get-role')
def get_role():
    global counter
    counter += 1
    counter %= 2
    return jsonify({
        "role": "caller" if counter else "responder"
    })

offer, answer = None, None

@app.route('/offer', methods=['GET', 'POST'])
def offer_route():
    global offer
    answer = None
    if request.method == 'POST':
        offer = request.get_json()
        return "offer upadated!"
    offercopy = offer.copy()
    offer = None
    return jsonify(offercopy)

@app.route('/answer', methods=['GET', 'POST'])
def answer_route():
    global answer
    if request.method == 'POST':
        answer = request.get_json()
        return "answer upadated!"
    if not answer:
        return jsonify({})
    print("calling copy on answer", answer)
    answercopy = answer.copy()
    answer = None
    return jsonify(answercopy)

@app.route('/')
def app_entry():
    return app.send_static_file("index.html")


app.run("192.168.2.19", port=8000)

