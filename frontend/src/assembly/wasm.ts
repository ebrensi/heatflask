// The entry file of your WebAssembly module.

let WIDTH: i32
let HEIGHT: i32

let TA1: f32
let TB1: f32
let TA2: f32
let TB2: f32

let COLOR: u32

export function setSize(width: i32, height: i32): void {
  WIDTH = width
  HEIGHT = height
}

export function setTransform(a1: f32, b1: f32, a2: f32, b2: f32): void {
  TA1 = a1
  TA2 = a2
  TB1 = b1
  TB2 = b2
}

export function setColor(color: u32): void {
  COLOR = color
}

export function clearRect(x: i32, y: i32, w: i32, h: i32): void {
  const widthInBytes = w << 2
  for (let row = y; row < y + h; row++) {
    const offsetBytes = (row * WIDTH + x) << 2
    memory.fill(offsetBytes, 0, widthInBytes)
  }
}

export function testFill(): void {
  memory.fill(0, 0xff, 4)
}
