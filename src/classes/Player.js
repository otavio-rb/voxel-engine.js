import { OrbitControls, PointerLockControls } from "three/examples/jsm/Addons.js";
import { Vector3 } from "three";

class Player {
    constructor({ camera, currentMode = "normal" }) {
        this.camera = camera;
        this.keys = {};
        this.canMove = true;

        this.speed = 0.24;
        this.flySpeed = 0.24;
        this.velocity = new Vector3();

        // Gravity and jump
        this.gravity = 0;
        this.yVelocity = 0;
        this.canJump = true;
        this.debugMode = false;

        // Pointer lock controls
        switch (currentMode) {
            case "normal":
                this.initPointerLockerControls();
                break;
            case "debug":
                this.debugMode = true;
                this.initPointerLockerControls();
                break;
            case "orbit":
                this.initOrbitControls();
                break
        }
    }

    initOrbitControls() {
        this.controls = new OrbitControls(this.camera, document.body);
    }

    initPointerLockerControls() {
        this.controls = new PointerLockControls(this.camera, document.body);
        this.initEvents();
    }

    initEvents() {
        document.addEventListener("keydown", (event) => {
            this.keys[event.key.toLowerCase()] = true;

            if (event.key === ";") {
                this.toggleChat();
            }
        });

        document.addEventListener("keyup", (event) => {
            this.keys[event.key.toLowerCase()] = false;
        });

        document.addEventListener("click", () => {
            if (!this.controls.isLocked) {
                this.controls.lock();
            }
        });
    }

    toggleChat() {
        const chatWrapper = document.querySelector(".chat-wrapper");
        const input = chatWrapper.querySelector("input");


        const isChatOpen = chatWrapper.style.display == "flex" ? true : false;

        if (isChatOpen) {
            chatWrapper.style.display = "none";
            this.canMove = true;
            input.value = 0;
        } else {
            chatWrapper.style.display = "flex";
            input.focus();
            this.canMove = false;
            this.controls.unlock();
        }

        input.value = "/";
    }

    move() {
        const direction = new Vector3();

        if (this.keys["w"]) direction.z += 1;
        if (this.keys["s"]) direction.z -= 1;
        if (this.keys["a"]) direction.x -= 1;
        if (this.keys["d"]) direction.x += 1;

        direction.normalize(); // Prevent faster diagonal movement

        if (this.canMove) {
            // Move forward/backward and left/right
            this.velocity.x = direction.x * this.speed;
            this.velocity.z = direction.z * this.speed;
            this.controls.moveRight(this.velocity.x);
            this.controls.moveForward(this.velocity.z);

            // Jump
            if (this.keys[" "] && this.canJump) {
                this.yVelocity = -0.4; // Initial jump impulse
                this.canJump = false;
            }

            // Gravity
            if (!this.keys["shift"] && !this.debugMode) {
                this.camera.position.y -= this.yVelocity;
                this.yVelocity += this.gravity;
            } else {
                if (this.keys[" "]) this.camera.position.y += this.flySpeed;
                if (this.keys["shift"]) this.camera.position.y -= this.flySpeed;
            }

            // Reset position if falling too low
            if (this.camera.position.y < -200) {
                this.camera.position.set(0, 5, 0);
                this.yVelocity = 0;
            }
        }
    }

    tpTo(x, y, z) {
        this.camera.position.set(x, y, z);
    }

    update() {
        this.move();
    }
}

export default Player;
