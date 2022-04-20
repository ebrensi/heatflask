(module
 (type $i32_i32_=>_none (func (param i32 i32)))
 (type $i32_=>_none (func (param i32)))
 (type $f64_f64_f64_f64_=>_none (func (param f64 f64 f64 f64)))
 (type $f32_=>_f32 (func (param f32) (result f32)))
 (type $i64_i64_i64_i64_=>_none (func (param i64 i64 i64 i64)))
 (type $f32_=>_none (func (param f32)))
 (type $none_=>_none (func))
 (type $i32_i32_i32_i32_=>_none (func (param i32 i32 i32 i32)))
 (type $f64_f64_f64_=>_none (func (param f64 f64 f64)))
 (type $f64_f64_i32_=>_none (func (param f64 f64 i32)))
 (type $i32_i32_i32_=>_none (func (param i32 i32 i32)))
 (import "wasm" "logi" (func $src/assembly/wasm/logi (param i64 i64 i64 i64)))
 (global $src/assembly/wasm/DOT_IMAGEDATA_OFFSET (mut i32) (i32.const 0))
 (global $src/assembly/wasm/DOT_IMAGEDATA_LENGTH (mut i32) (i32.const 0))
 (global $src/assembly/wasm/PATH_IMAGEDATA_OFFSET (mut i32) (i32.const 0))
 (global $src/assembly/wasm/PATH_IMAGEDATA_LENGTH (mut i32) (i32.const 0))
 (global $src/assembly/wasm/XMIN (mut i32) (i32.const 0))
 (global $src/assembly/wasm/XMAX (mut i32) (i32.const 0))
 (global $src/assembly/wasm/YMIN (mut i32) (i32.const 0))
 (global $src/assembly/wasm/YMAX (mut i32) (i32.const 0))
 (global $src/assembly/wasm/BOUNDSEMPTY (mut i32) (i32.const 1))
 (global $src/assembly/wasm/WIDTH (mut i32) (i32.const 0))
 (global $src/assembly/wasm/HEIGHT (mut i32) (i32.const 0))
 (global $src/assembly/wasm/TA1 (mut f64) (f64.const 0))
 (global $src/assembly/wasm/TB1 (mut f64) (f64.const 0))
 (global $src/assembly/wasm/TA2 (mut f64) (f64.const 0))
 (global $src/assembly/wasm/TB2 (mut f64) (f64.const 0))
 (global $src/assembly/wasm/COLOR (mut i32) (i32.const 0))
 (global $src/assembly/wasm/MASKEDCOLOR (mut i32) (i32.const 0))
 (global $src/assembly/wasm/ALPHAMASK (mut i32) (i32.const 0))
 (global $src/assembly/wasm/ALPHAPOS (mut i32) (i32.const 0))
 (global $src/assembly/wasm/LINEWIDTH (mut i32) (i32.const 1))
 (global $~argumentsLength (mut i32) (i32.const 0))
 (global $~lib/math/rempio2f_y (mut f64) (f64.const 0))
 (memory $0 1)
 (data (i32.const 1024) ")\15DNn\83\f9\a2\c0\dd4\f5\d1W\'\fcA\90C<\99\95b\dba\c5\bb\de\abcQ\fe")
 (export "DOT_IMAGEDATA_OFFSET" (global $src/assembly/wasm/DOT_IMAGEDATA_OFFSET))
 (export "DOT_IMAGEDATA_LENGTH" (global $src/assembly/wasm/DOT_IMAGEDATA_LENGTH))
 (export "PATH_IMAGEDATA_OFFSET" (global $src/assembly/wasm/PATH_IMAGEDATA_OFFSET))
 (export "PATH_IMAGEDATA_LENGTH" (global $src/assembly/wasm/PATH_IMAGEDATA_LENGTH))
 (export "XMIN" (global $src/assembly/wasm/XMIN))
 (export "XMAX" (global $src/assembly/wasm/XMAX))
 (export "YMIN" (global $src/assembly/wasm/YMIN))
 (export "YMAX" (global $src/assembly/wasm/YMAX))
 (export "BOUNDSEMPTY" (global $src/assembly/wasm/BOUNDSEMPTY))
 (export "setSize" (func $src/assembly/wasm/setSize))
 (export "setTransform" (func $src/assembly/wasm/setTransform))
 (export "setAlphaMask" (func $src/assembly/wasm/setAlphaMask))
 (export "setLineWidth" (func $src/assembly/wasm/setLineWidth))
 (export "setAlphaScale" (func $src/assembly/wasm/setAlphaScale))
 (export "setColor" (func $src/assembly/wasm/setColor))
 (export "resetDrawBounds" (func $src/assembly/wasm/resetDrawBounds))
 (export "updateDrawBounds" (func $src/assembly/wasm/updateDrawBounds))
 (export "clearRect" (func $src/assembly/wasm/clearRect))
 (export "moveRect" (func $src/assembly/wasm/moveRect))
 (export "drawSquare" (func $src/assembly/wasm/drawSquare))
 (export "drawCircle" (func $src/assembly/wasm/drawCircle))
 (export "drawSegment" (func $src/assembly/wasm/drawSegment))
 (export "CRSproject" (func $src/assembly/wasm/CRSproject@varargs))
 (export "memory" (memory $0))
 (export "__setArgumentsLength" (func $~setArgumentsLength))
 (func $src/assembly/wasm/setSize (param $0 i32) (param $1 i32)
  local.get $0
  global.set $src/assembly/wasm/WIDTH
  local.get $1
  global.set $src/assembly/wasm/HEIGHT
  global.get $src/assembly/wasm/WIDTH
  i64.extend_i32_s
  global.get $src/assembly/wasm/HEIGHT
  i64.extend_i32_s
  i64.const 0
  i64.const 0
  call $src/assembly/wasm/logi
 )
 (func $src/assembly/wasm/setTransform (param $0 f64) (param $1 f64) (param $2 f64) (param $3 f64)
  local.get $0
  global.set $src/assembly/wasm/TA1
  local.get $2
  global.set $src/assembly/wasm/TA2
  local.get $1
  global.set $src/assembly/wasm/TB1
  local.get $3
  global.set $src/assembly/wasm/TB2
 )
 (func $src/assembly/wasm/setAlphaMask (param $0 i32) (param $1 i32)
  local.get $0
  global.set $src/assembly/wasm/ALPHAMASK
  local.get $1
  global.set $src/assembly/wasm/ALPHAPOS
 )
 (func $src/assembly/wasm/setLineWidth (param $0 i32)
  local.get $0
  global.set $src/assembly/wasm/LINEWIDTH
 )
 (func $src/assembly/wasm/setAlphaScale (param $0 f32)
  nop
 )
 (func $src/assembly/wasm/setColor (param $0 i32)
  local.get $0
  global.set $src/assembly/wasm/COLOR
  global.get $src/assembly/wasm/ALPHAMASK
  global.get $src/assembly/wasm/COLOR
  i32.and
  global.set $src/assembly/wasm/MASKEDCOLOR
 )
 (func $src/assembly/wasm/resetDrawBounds
  i32.const 1
  global.set $src/assembly/wasm/BOUNDSEMPTY
 )
 (func $src/assembly/wasm/updateDrawBounds (param $0 i32) (param $1 i32)
  global.get $src/assembly/wasm/BOUNDSEMPTY
  if
   local.get $0
   global.set $src/assembly/wasm/XMIN
   local.get $0
   global.set $src/assembly/wasm/XMAX
   local.get $1
   global.set $src/assembly/wasm/YMIN
   local.get $1
   global.set $src/assembly/wasm/YMAX
   i32.const 0
   global.set $src/assembly/wasm/BOUNDSEMPTY
   return
  end
  global.get $src/assembly/wasm/XMIN
  local.get $0
  i32.gt_s
  if
   local.get $0
   global.set $src/assembly/wasm/XMIN
  else
   global.get $src/assembly/wasm/XMAX
   local.get $0
   i32.lt_s
   if
    local.get $0
    global.set $src/assembly/wasm/XMAX
   end
  end
  global.get $src/assembly/wasm/YMIN
  local.get $1
  i32.gt_s
  if
   local.get $1
   global.set $src/assembly/wasm/YMIN
  else
   global.get $src/assembly/wasm/YMAX
   local.get $1
   i32.lt_s
   if
    local.get $1
    global.set $src/assembly/wasm/YMAX
   end
  end
 )
 (func $src/assembly/wasm/clearRect (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32)
  local.get $3
  i32.const 0
  local.get $2
  select
  i32.eqz
  if
   return
  end
  local.get $2
  i32.const 2
  i32.shl
  local.set $2
  local.get $1
  local.get $3
  i32.add
  local.set $3
  loop $for-loop|0
   local.get $1
   local.get $3
   i32.lt_s
   if
    local.get $0
    global.get $src/assembly/wasm/WIDTH
    local.get $1
    i32.mul
    i32.add
    i32.const 2
    i32.shl
    i32.const 0
    local.get $2
    memory.fill
    local.get $1
    i32.const 1
    i32.add
    local.set $1
    br $for-loop|0
   end
  end
 )
 (func $src/assembly/wasm/moveRect (param $0 i32) (param $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  (local $11 i32)
  (local $12 i32)
  i32.const 1
  local.get $1
  local.get $0
  select
  i32.eqz
  if
   return
  end
  global.get $src/assembly/wasm/YMIN
  local.set $6
  global.get $src/assembly/wasm/XMAX
  global.get $src/assembly/wasm/XMIN
  i32.sub
  local.set $5
  global.get $src/assembly/wasm/YMAX
  global.get $src/assembly/wasm/YMIN
  i32.sub
  local.set $11
  global.get $src/assembly/wasm/WIDTH
  local.set $7
  block $src/assembly/wasm/clip|inlined.0
   global.get $src/assembly/wasm/XMIN
   local.tee $9
   local.get $0
   i32.add
   local.tee $8
   i32.const 0
   i32.lt_s
   br_if $src/assembly/wasm/clip|inlined.0
   local.get $7
   local.tee $4
   local.get $8
   i32.lt_s
   br_if $src/assembly/wasm/clip|inlined.0
   local.get $8
   local.set $4
  end
  global.get $src/assembly/wasm/HEIGHT
  local.set $7
  block $src/assembly/wasm/clip|inlined.1
   local.get $1
   local.get $6
   i32.add
   local.tee $8
   i32.const 0
   i32.lt_s
   br_if $src/assembly/wasm/clip|inlined.1
   local.get $7
   local.tee $3
   local.get $8
   i32.lt_s
   br_if $src/assembly/wasm/clip|inlined.1
   local.get $8
   local.set $3
  end
  global.get $src/assembly/wasm/WIDTH
  local.set $7
  block $src/assembly/wasm/clip|inlined.2
   local.get $0
   local.get $5
   local.get $9
   i32.add
   i32.add
   local.tee $8
   i32.const 0
   i32.lt_s
   br_if $src/assembly/wasm/clip|inlined.2
   local.get $7
   local.tee $2
   local.get $8
   i32.lt_s
   br_if $src/assembly/wasm/clip|inlined.2
   local.get $8
   local.set $2
  end
  local.get $2
  local.get $4
  i32.sub
  local.set $10
  global.get $src/assembly/wasm/HEIGHT
  local.set $7
  i32.const 0
  local.set $2
  block $src/assembly/wasm/clip|inlined.3
   local.get $1
   local.get $6
   local.get $11
   i32.add
   i32.add
   local.tee $8
   i32.const 0
   i32.lt_s
   br_if $src/assembly/wasm/clip|inlined.3
   local.get $7
   local.tee $2
   local.get $8
   i32.lt_s
   br_if $src/assembly/wasm/clip|inlined.3
   local.get $8
   local.set $2
  end
  local.get $2
  local.get $3
  i32.sub
  local.tee $7
  i32.const 0
  local.get $10
  select
  i32.eqz
  if
   local.get $6
   local.set $0
   local.get $11
   i32.const 0
   local.get $5
   select
   if
    local.get $5
    i32.const 2
    i32.shl
    local.set $1
    local.get $0
    local.get $11
    i32.add
    local.set $2
    loop $for-loop|0
     local.get $0
     local.get $2
     i32.lt_s
     if
      local.get $9
      global.get $src/assembly/wasm/WIDTH
      local.get $0
      i32.mul
      i32.add
      i32.const 2
      i32.shl
      i32.const 0
      local.get $1
      memory.fill
      local.get $0
      i32.const 1
      i32.add
      local.set $0
      br $for-loop|0
     end
    end
   end
   i32.const 1
   global.set $src/assembly/wasm/BOUNDSEMPTY
   return
  end
  local.get $9
  local.get $4
  local.get $0
  i32.sub
  local.tee $8
  local.get $4
  local.get $10
  i32.add
  local.get $4
  local.get $8
  i32.gt_s
  select
  local.get $3
  local.get $3
  local.get $1
  i32.sub
  local.tee $2
  i32.ne
  select
  local.set $12
  local.get $6
  local.get $6
  local.get $7
  i32.add
  local.get $2
  local.get $2
  local.get $3
  i32.lt_s
  select
  local.get $2
  local.get $3
  i32.gt_s
  select
  local.set $0
  local.get $11
  local.get $7
  i32.sub
  local.get $7
  local.get $2
  local.get $3
  i32.ne
  local.tee $1
  select
  local.tee $6
  i32.const 0
  local.get $1
  if (result i32)
   local.get $5
  else
   local.get $8
   local.get $4
   i32.sub
   local.tee $1
   i32.const 31
   i32.shr_s
   local.tee $11
   local.get $1
   local.get $11
   i32.add
   i32.xor
  end
  local.tee $1
  select
  if
   local.get $6
   i32.const 0
   local.get $1
   select
   if
    local.get $1
    i32.const 2
    i32.shl
    local.set $1
    local.get $0
    local.get $6
    i32.add
    local.set $6
    loop $for-loop|1
     local.get $0
     local.get $6
     i32.lt_s
     if
      local.get $12
      global.get $src/assembly/wasm/WIDTH
      local.get $0
      i32.mul
      i32.add
      i32.const 2
      i32.shl
      i32.const 0
      local.get $1
      memory.fill
      local.get $0
      i32.const 1
      i32.add
      local.set $0
      br $for-loop|1
     end
    end
   end
  end
  local.get $10
  i32.const 2
  i32.shl
  local.set $1
  local.get $2
  local.get $3
  i32.gt_s
  if
   i32.const 0
   local.set $0
   loop $for-loop|2
    local.get $0
    local.get $7
    i32.lt_s
    if
     global.get $src/assembly/wasm/WIDTH
     local.get $0
     local.get $3
     i32.add
     i32.mul
     local.get $4
     i32.add
     i32.const 2
     i32.shl
     global.get $src/assembly/wasm/WIDTH
     local.get $0
     local.get $2
     i32.add
     i32.mul
     local.tee $6
     local.get $8
     i32.add
     i32.const 2
     i32.shl
     local.get $1
     memory.copy
     local.get $6
     local.get $9
     i32.add
     i32.const 2
     i32.shl
     i32.const 0
     local.get $5
     i32.const 2
     i32.shl
     memory.fill
     local.get $0
     i32.const 1
     i32.add
     local.set $0
     br $for-loop|2
    end
   end
  else
   local.get $2
   local.get $3
   i32.lt_s
   if
    local.get $7
    i32.const 1
    i32.sub
    local.set $0
    loop $for-loop|3
     local.get $0
     i32.const 0
     i32.ge_s
     if
      global.get $src/assembly/wasm/WIDTH
      local.get $0
      local.get $3
      i32.add
      i32.mul
      local.get $4
      i32.add
      i32.const 2
      i32.shl
      global.get $src/assembly/wasm/WIDTH
      local.get $0
      local.get $2
      i32.add
      i32.mul
      local.tee $6
      local.get $8
      i32.add
      i32.const 2
      i32.shl
      local.get $1
      memory.copy
      local.get $6
      local.get $9
      i32.add
      i32.const 2
      i32.shl
      i32.const 0
      local.get $5
      i32.const 2
      i32.shl
      memory.fill
      local.get $0
      i32.const 1
      i32.sub
      local.set $0
      br $for-loop|3
     end
    end
   else
    i32.const 0
    local.set $0
    loop $for-loop|4
     local.get $0
     local.get $7
     i32.lt_s
     if
      global.get $src/assembly/wasm/WIDTH
      local.get $0
      local.get $3
      i32.add
      i32.mul
      local.get $4
      i32.add
      i32.const 2
      i32.shl
      global.get $src/assembly/wasm/WIDTH
      local.get $0
      local.get $2
      i32.add
      i32.mul
      local.get $8
      i32.add
      i32.const 2
      i32.shl
      local.get $1
      memory.copy
      local.get $0
      i32.const 1
      i32.add
      local.set $0
      br $for-loop|4
     end
    end
   end
  end
  i32.const 1
  global.set $src/assembly/wasm/BOUNDSEMPTY
  local.get $4
  global.set $src/assembly/wasm/XMIN
  local.get $4
  global.set $src/assembly/wasm/XMAX
  local.get $3
  global.set $src/assembly/wasm/YMIN
  local.get $3
  global.set $src/assembly/wasm/YMAX
  i32.const 0
  global.set $src/assembly/wasm/BOUNDSEMPTY
  local.get $4
  local.get $10
  i32.add
  local.tee $0
  global.get $src/assembly/wasm/XMIN
  i32.lt_s
  if
   local.get $0
   global.set $src/assembly/wasm/XMIN
  else
   global.get $src/assembly/wasm/XMAX
   local.get $0
   i32.lt_s
   if
    local.get $0
    global.set $src/assembly/wasm/XMAX
   end
  end
  local.get $3
  local.get $7
  i32.add
  local.tee $0
  global.get $src/assembly/wasm/YMIN
  i32.lt_s
  if
   local.get $0
   global.set $src/assembly/wasm/YMIN
  else
   global.get $src/assembly/wasm/YMAX
   local.get $0
   i32.lt_s
   if
    local.get $0
    global.set $src/assembly/wasm/YMAX
   end
  end
 )
 (func $src/assembly/wasm/drawSquare (param $0 f64) (param $1 f64) (param $2 f64)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 f64)
  (local $7 i32)
  (local $8 i32)
  (local $9 f64)
  (local $10 i32)
  (local $11 i32)
  global.get $src/assembly/wasm/TA1
  local.get $0
  f64.mul
  global.get $src/assembly/wasm/TB1
  f64.add
  local.get $2
  f64.const 0.5
  f64.mul
  local.tee $0
  f64.sub
  local.tee $9
  f64.ceil
  local.tee $6
  local.get $6
  f64.const 1
  f64.sub
  local.get $9
  local.get $6
  f64.const 0.5
  f64.sub
  f64.ge
  select
  i32.trunc_sat_f64_s
  local.tee $3
  global.get $src/assembly/wasm/WIDTH
  i32.lt_s
  local.get $3
  i32.const 0
  i32.ge_s
  i32.and
  global.get $src/assembly/wasm/TA2
  local.get $1
  f64.mul
  global.get $src/assembly/wasm/TB2
  f64.add
  local.get $0
  f64.sub
  local.tee $0
  f64.ceil
  local.tee $1
  local.get $1
  f64.const 1
  f64.sub
  local.get $0
  local.get $1
  f64.const 0.5
  f64.sub
  f64.ge
  select
  i32.trunc_sat_f64_s
  local.tee $4
  i32.const 0
  i32.ge_s
  i32.and
  global.get $src/assembly/wasm/HEIGHT
  local.get $4
  i32.gt_s
  i32.and
  i32.eqz
  if
   return
  end
  local.get $2
  i32.trunc_sat_f64_s
  local.set $8
  block $src/assembly/wasm/updateDrawBounds|inlined.2
   global.get $src/assembly/wasm/BOUNDSEMPTY
   if
    local.get $3
    global.set $src/assembly/wasm/XMIN
    local.get $3
    global.set $src/assembly/wasm/XMAX
    local.get $4
    global.set $src/assembly/wasm/YMIN
    local.get $4
    global.set $src/assembly/wasm/YMAX
    i32.const 0
    global.set $src/assembly/wasm/BOUNDSEMPTY
    br $src/assembly/wasm/updateDrawBounds|inlined.2
   end
   global.get $src/assembly/wasm/XMIN
   local.get $3
   i32.gt_s
   if
    local.get $3
    global.set $src/assembly/wasm/XMIN
   else
    global.get $src/assembly/wasm/XMAX
    local.get $3
    i32.lt_s
    if
     local.get $3
     global.set $src/assembly/wasm/XMAX
    end
   end
   global.get $src/assembly/wasm/YMIN
   local.get $4
   i32.gt_s
   if
    local.get $4
    global.set $src/assembly/wasm/YMIN
   else
    global.get $src/assembly/wasm/YMAX
    local.get $4
    i32.lt_s
    if
     local.get $4
     global.set $src/assembly/wasm/YMAX
    end
   end
  end
  i32.const 0
  local.get $3
  local.get $3
  i32.const 0
  i32.lt_s
  select
  local.set $5
  local.get $3
  local.get $8
  i32.add
  local.tee $3
  global.get $src/assembly/wasm/WIDTH
  local.tee $7
  local.get $3
  local.get $7
  i32.lt_s
  select
  local.set $7
  local.get $4
  local.get $8
  i32.add
  local.tee $3
  global.get $src/assembly/wasm/HEIGHT
  local.tee $8
  local.get $3
  local.get $8
  i32.lt_s
  select
  local.set $8
  i32.const 0
  local.get $4
  local.get $4
  i32.const 0
  i32.lt_s
  select
  local.set $4
  loop $for-loop|0
   local.get $4
   local.get $8
   i32.lt_s
   if
    global.get $src/assembly/wasm/COLOR
    local.set $10
    global.get $src/assembly/wasm/DOT_IMAGEDATA_OFFSET
    global.get $src/assembly/wasm/WIDTH
    local.get $4
    i32.mul
    local.tee $3
    local.get $7
    i32.add
    i32.const 2
    i32.shl
    i32.add
    local.set $11
    global.get $src/assembly/wasm/DOT_IMAGEDATA_OFFSET
    local.get $3
    local.get $5
    i32.add
    i32.const 2
    i32.shl
    i32.add
    local.set $3
    loop $for-loop|1
     local.get $3
     local.get $11
     i32.lt_u
     if
      local.get $3
      local.get $10
      i32.store
      local.get $3
      i32.const 4
      i32.add
      local.set $3
      br $for-loop|1
     end
    end
    local.get $4
    i32.const 1
    i32.add
    local.set $4
    br $for-loop|0
   end
  end
 )
 (func $src/assembly/wasm/drawCircle (param $0 f64) (param $1 f64) (param $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 f64)
  (local $10 i32)
  (local $11 i32)
  global.get $src/assembly/wasm/TA1
  local.get $0
  f64.mul
  global.get $src/assembly/wasm/TB1
  f64.add
  local.tee $0
  f64.ceil
  local.tee $9
  local.get $9
  f64.const 1
  f64.sub
  local.get $0
  local.get $9
  f64.const 0.5
  f64.sub
  f64.ge
  select
  i32.trunc_sat_f64_s
  local.tee $5
  global.get $src/assembly/wasm/WIDTH
  i32.lt_s
  local.get $5
  i32.const 0
  i32.ge_s
  i32.and
  global.get $src/assembly/wasm/TA2
  local.get $1
  f64.mul
  global.get $src/assembly/wasm/TB2
  f64.add
  local.tee $1
  f64.ceil
  local.tee $0
  local.get $0
  f64.const 1
  f64.sub
  local.get $1
  local.get $0
  f64.const 0.5
  f64.sub
  f64.ge
  select
  i32.trunc_sat_f64_s
  local.tee $4
  i32.const 0
  i32.ge_s
  i32.and
  global.get $src/assembly/wasm/HEIGHT
  local.get $4
  i32.gt_s
  i32.and
  i32.eqz
  if
   return
  end
  block $src/assembly/wasm/updateDrawBounds|inlined.3
   global.get $src/assembly/wasm/BOUNDSEMPTY
   if
    local.get $5
    global.set $src/assembly/wasm/XMIN
    local.get $5
    global.set $src/assembly/wasm/XMAX
    local.get $4
    global.set $src/assembly/wasm/YMIN
    local.get $4
    global.set $src/assembly/wasm/YMAX
    i32.const 0
    global.set $src/assembly/wasm/BOUNDSEMPTY
    br $src/assembly/wasm/updateDrawBounds|inlined.3
   end
   global.get $src/assembly/wasm/XMIN
   local.get $5
   i32.gt_s
   if
    local.get $5
    global.set $src/assembly/wasm/XMIN
   else
    global.get $src/assembly/wasm/XMAX
    local.get $5
    i32.lt_s
    if
     local.get $5
     global.set $src/assembly/wasm/XMAX
    end
   end
   global.get $src/assembly/wasm/YMIN
   local.get $4
   i32.gt_s
   if
    local.get $4
    global.set $src/assembly/wasm/YMIN
   else
    global.get $src/assembly/wasm/YMAX
    local.get $4
    i32.lt_s
    if
     local.get $4
     global.set $src/assembly/wasm/YMAX
    end
   end
  end
  local.get $2
  local.get $2
  i32.mul
  local.set $6
  local.get $2
  global.get $src/assembly/wasm/HEIGHT
  local.get $4
  i32.sub
  local.tee $3
  local.get $2
  local.get $3
  i32.lt_s
  select
  local.set $7
  i32.const 0
  local.get $4
  i32.sub
  local.tee $3
  i32.const 1
  local.get $2
  i32.sub
  local.tee $2
  local.get $2
  local.get $3
  i32.lt_s
  select
  local.set $2
  loop $for-loop|0
   local.get $2
   local.get $7
   i32.lt_s
   if
    global.get $src/assembly/wasm/COLOR
    local.set $8
    global.get $src/assembly/wasm/DOT_IMAGEDATA_OFFSET
    local.get $5
    local.get $6
    local.get $2
    local.get $2
    i32.mul
    i32.sub
    f64.convert_i32_s
    f64.sqrt
    local.tee $0
    f64.ceil
    local.tee $1
    local.get $1
    f64.const 1
    f64.sub
    local.get $0
    local.get $1
    f64.const 0.5
    f64.sub
    f64.ge
    select
    i32.trunc_sat_f64_s
    local.tee $3
    i32.add
    local.tee $10
    global.get $src/assembly/wasm/WIDTH
    local.tee $11
    local.get $10
    local.get $11
    i32.lt_s
    select
    global.get $src/assembly/wasm/WIDTH
    local.get $2
    local.get $4
    i32.add
    i32.mul
    local.tee $10
    i32.add
    i32.const 2
    i32.shl
    i32.add
    local.set $11
    global.get $src/assembly/wasm/DOT_IMAGEDATA_OFFSET
    i32.const 0
    local.get $5
    local.get $3
    i32.sub
    local.tee $3
    local.get $3
    i32.const 0
    i32.lt_s
    select
    local.get $10
    i32.add
    i32.const 2
    i32.shl
    i32.add
    local.set $3
    loop $for-loop|1
     local.get $3
     local.get $11
     i32.lt_u
     if
      local.get $3
      local.get $8
      i32.store
      local.get $3
      i32.const 4
      i32.add
      local.set $3
      br $for-loop|1
     end
    end
    local.get $2
    i32.const 1
    i32.add
    local.set $2
    br $for-loop|0
   end
  end
 )
 (func $src/assembly/wasm/drawSegment (param $0 f64) (param $1 f64) (param $2 f64) (param $3 f64)
  (local $4 i32)
  (local $5 f64)
  (local $6 f64)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  (local $11 i32)
  (local $12 i32)
  (local $13 f64)
  (local $14 f64)
  (local $15 i32)
  (local $16 i32)
  (local $17 f32)
  (local $18 f32)
  (local $19 i32)
  (local $20 i32)
  (local $21 i32)
  (local $22 i32)
  i32.const 1
  i32.const 2
  i32.const 0
  global.get $src/assembly/wasm/WIDTH
  f64.convert_i32_s
  f64.const 3
  f64.sub
  local.tee $14
  global.get $src/assembly/wasm/TA1
  local.get $0
  f64.mul
  global.get $src/assembly/wasm/TB1
  f64.add
  local.tee $0
  f64.lt
  select
  local.get $0
  f64.const 3
  f64.lt
  select
  local.tee $4
  i32.const 4
  i32.or
  local.get $4
  i32.const 8
  i32.or
  local.get $4
  global.get $src/assembly/wasm/HEIGHT
  f64.convert_i32_s
  f64.const 3
  f64.sub
  local.tee $13
  global.get $src/assembly/wasm/TA2
  local.get $1
  f64.mul
  global.get $src/assembly/wasm/TB2
  f64.add
  local.tee $1
  f64.lt
  select
  local.get $1
  f64.const 3
  f64.lt
  select
  local.set $4
  global.get $src/assembly/wasm/TA2
  local.get $3
  f64.mul
  global.get $src/assembly/wasm/TB2
  f64.add
  local.tee $3
  local.set $6
  global.get $src/assembly/wasm/TA1
  local.get $2
  f64.mul
  global.get $src/assembly/wasm/TB1
  f64.add
  local.tee $2
  local.set $5
  i32.const 1
  i32.const 2
  i32.const 0
  local.get $2
  local.get $14
  f64.gt
  select
  local.get $2
  f64.const 3
  f64.lt
  select
  local.tee $7
  i32.const 4
  i32.or
  local.get $7
  i32.const 8
  i32.or
  local.get $7
  local.get $3
  local.get $13
  f64.gt
  select
  local.get $3
  f64.const 3
  f64.lt
  select
  local.set $7
  loop $while-continue|0
   local.get $4
   local.get $7
   i32.or
   i32.const 255
   i32.and
   if
    local.get $4
    local.get $7
    i32.and
    i32.const 255
    i32.and
    if
     return
    else
     local.get $7
     local.get $4
     local.get $7
     i32.const 255
     i32.and
     local.get $4
     i32.const 255
     i32.and
     i32.gt_u
     select
     local.tee $8
     i32.const 8
     i32.and
     if
      local.get $0
      local.get $2
      local.get $0
      f64.sub
      global.get $src/assembly/wasm/HEIGHT
      f64.convert_i32_s
      f64.const 3
      f64.sub
      local.tee $6
      local.get $1
      f64.sub
      f64.mul
      local.get $3
      local.get $1
      f64.sub
      f64.div
      f64.add
      local.set $5
     else
      local.get $8
      i32.const 4
      i32.and
      if
       f64.const 3
       local.set $6
       local.get $0
       local.get $2
       local.get $0
       f64.sub
       f64.const 3
       local.get $1
       f64.sub
       f64.mul
       local.get $3
       local.get $1
       f64.sub
       f64.div
       f64.add
       local.set $5
      else
       local.get $8
       i32.const 2
       i32.and
       if
        local.get $1
        local.get $3
        local.get $1
        f64.sub
        global.get $src/assembly/wasm/WIDTH
        f64.convert_i32_s
        f64.const 3
        f64.sub
        local.tee $5
        local.get $0
        f64.sub
        f64.mul
        local.get $2
        local.get $0
        f64.sub
        f64.div
        f64.add
        local.set $6
       else
        local.get $8
        i32.const 1
        i32.and
        if
         local.get $1
         local.get $3
         local.get $1
         f64.sub
         f64.const 3
         local.get $0
         f64.sub
         f64.mul
         local.get $2
         local.get $0
         f64.sub
         f64.div
         f64.add
         local.set $6
         f64.const 3
         local.set $5
        end
       end
      end
     end
     local.get $8
     i32.const 255
     i32.and
     local.get $4
     i32.const 255
     i32.and
     i32.eq
     if
      i32.const 1
      i32.const 2
      i32.const 0
      local.get $5
      local.tee $0
      global.get $src/assembly/wasm/WIDTH
      f64.convert_i32_s
      f64.const 3
      f64.sub
      f64.gt
      select
      local.get $0
      f64.const 3
      f64.lt
      select
      local.tee $4
      i32.const 4
      i32.or
      local.get $4
      i32.const 8
      i32.or
      local.get $4
      local.get $6
      local.tee $1
      global.get $src/assembly/wasm/HEIGHT
      f64.convert_i32_s
      f64.const 3
      f64.sub
      f64.gt
      select
      local.get $1
      f64.const 3
      f64.lt
      select
      local.set $4
     else
      i32.const 1
      i32.const 2
      i32.const 0
      local.get $5
      local.tee $2
      global.get $src/assembly/wasm/WIDTH
      f64.convert_i32_s
      f64.const 3
      f64.sub
      f64.gt
      select
      local.get $2
      f64.const 3
      f64.lt
      select
      local.tee $7
      i32.const 4
      i32.or
      local.get $7
      i32.const 8
      i32.or
      local.get $7
      local.get $6
      local.tee $3
      global.get $src/assembly/wasm/HEIGHT
      f64.convert_i32_s
      f64.const 3
      f64.sub
      f64.gt
      select
      local.get $3
      f64.const 3
      f64.lt
      select
      local.set $7
     end
     br $while-continue|0
    end
    unreachable
   end
  end
  local.get $2
  f64.ceil
  local.tee $5
  local.get $5
  f64.const 1
  f64.sub
  local.get $2
  local.get $5
  f64.const 0.5
  f64.sub
  f64.ge
  select
  i32.trunc_sat_f64_s
  local.set $22
  local.get $3
  f64.ceil
  local.tee $2
  local.get $2
  f64.const 1
  f64.sub
  local.get $3
  local.get $2
  f64.const 0.5
  f64.sub
  f64.ge
  select
  i32.trunc_sat_f64_s
  local.set $21
  local.get $0
  f64.ceil
  local.tee $2
  local.get $2
  f64.const 1
  f64.sub
  local.get $0
  local.get $2
  f64.const 0.5
  f64.sub
  f64.ge
  select
  i32.trunc_sat_f64_s
  local.set $11
  local.get $1
  f64.ceil
  local.tee $0
  local.get $0
  f64.const 1
  f64.sub
  local.get $1
  local.get $0
  f64.const 0.5
  f64.sub
  f64.ge
  select
  i32.trunc_sat_f64_s
  local.set $10
  block $src/assembly/wasm/updateDrawBounds|inlined.4
   global.get $src/assembly/wasm/BOUNDSEMPTY
   if
    local.get $11
    global.set $src/assembly/wasm/XMIN
    local.get $11
    global.set $src/assembly/wasm/XMAX
    local.get $10
    global.set $src/assembly/wasm/YMIN
    local.get $10
    global.set $src/assembly/wasm/YMAX
    i32.const 0
    global.set $src/assembly/wasm/BOUNDSEMPTY
    br $src/assembly/wasm/updateDrawBounds|inlined.4
   end
   global.get $src/assembly/wasm/XMIN
   local.get $11
   i32.gt_s
   if
    local.get $11
    global.set $src/assembly/wasm/XMIN
   else
    global.get $src/assembly/wasm/XMAX
    local.get $11
    i32.lt_s
    if
     local.get $11
     global.set $src/assembly/wasm/XMAX
    end
   end
   global.get $src/assembly/wasm/YMIN
   local.get $10
   i32.gt_s
   if
    local.get $10
    global.set $src/assembly/wasm/YMIN
   else
    global.get $src/assembly/wasm/YMAX
    local.get $10
    i32.lt_s
    if
     local.get $10
     global.set $src/assembly/wasm/YMAX
    end
   end
  end
  block $src/assembly/wasm/updateDrawBounds|inlined.5
   global.get $src/assembly/wasm/BOUNDSEMPTY
   if
    local.get $22
    global.set $src/assembly/wasm/XMIN
    local.get $22
    global.set $src/assembly/wasm/XMAX
    local.get $21
    global.set $src/assembly/wasm/YMIN
    local.get $21
    global.set $src/assembly/wasm/YMAX
    i32.const 0
    global.set $src/assembly/wasm/BOUNDSEMPTY
    br $src/assembly/wasm/updateDrawBounds|inlined.5
   end
   global.get $src/assembly/wasm/XMIN
   local.get $22
   i32.gt_s
   if
    local.get $22
    global.set $src/assembly/wasm/XMIN
   else
    global.get $src/assembly/wasm/XMAX
    local.get $22
    i32.lt_s
    if
     local.get $22
     global.set $src/assembly/wasm/XMAX
    end
   end
   global.get $src/assembly/wasm/YMIN
   local.get $21
   i32.gt_s
   if
    local.get $21
    global.set $src/assembly/wasm/YMIN
   else
    global.get $src/assembly/wasm/YMAX
    local.get $21
    i32.lt_s
    if
     local.get $21
     global.set $src/assembly/wasm/YMAX
    end
   end
  end
  global.get $src/assembly/wasm/LINEWIDTH
  f32.convert_i32_s
  f32.const 1
  f32.add
  f32.const 0.5
  f32.mul
  local.set $18
  i32.const 1
  i32.const -1
  local.get $11
  local.get $22
  i32.lt_s
  select
  local.set $16
  i32.const 1
  i32.const -1
  local.get $10
  local.get $21
  i32.lt_s
  select
  local.set $15
  local.get $22
  local.get $11
  i32.sub
  local.tee $7
  i32.const 31
  i32.shr_s
  local.tee $4
  local.get $4
  local.get $7
  i32.add
  i32.xor
  local.tee $20
  local.get $21
  local.get $10
  i32.sub
  local.tee $7
  i32.const 31
  i32.shr_s
  local.tee $4
  local.get $4
  local.get $7
  i32.add
  i32.xor
  local.tee $19
  i32.sub
  local.set $4
  local.get $20
  local.get $20
  i32.mul
  local.get $19
  local.get $19
  i32.mul
  i32.add
  f32.convert_i32_s
  f32.sqrt
  f32.const 1
  local.get $19
  local.get $20
  i32.add
  select
  local.set $17
  loop $while-continue|1
   block $while-break|1
    global.get $src/assembly/wasm/PATH_IMAGEDATA_OFFSET
    local.get $11
    global.get $src/assembly/wasm/WIDTH
    local.get $10
    i32.mul
    i32.add
    i32.const 2
    i32.shl
    i32.add
    global.get $src/assembly/wasm/MASKEDCOLOR
    i32.const 255
    i32.const 0
    local.get $19
    local.get $4
    local.get $20
    i32.sub
    i32.add
    local.tee $8
    i32.const 31
    i32.shr_s
    local.tee $7
    local.get $7
    local.get $8
    i32.add
    i32.xor
    f32.convert_i32_s
    local.get $17
    f32.div
    local.get $18
    f32.sub
    f32.const 1
    f32.add
    f64.promote_f32
    f64.const 255
    f64.mul
    i32.trunc_sat_f64_s
    local.tee $7
    local.get $7
    i32.const 0
    i32.lt_s
    select
    i32.sub
    global.get $src/assembly/wasm/ALPHAPOS
    i32.shl
    i32.or
    i32.store
    local.get $11
    local.set $8
    i32.const 0
    local.get $20
    i32.sub
    local.get $4
    local.tee $7
    i32.const 1
    i32.shl
    i32.le_s
    if
     local.get $7
     local.get $19
     i32.add
     local.set $7
     local.get $10
     local.set $9
     loop $for-loop|2
      local.get $9
      local.get $21
      i32.ne
      local.get $19
      local.get $20
      i32.lt_s
      i32.or
      local.get $17
      local.get $18
      f32.mul
      i32.trunc_sat_f32_s
      local.get $7
      i32.gt_s
      i32.and
      if
       global.get $src/assembly/wasm/PATH_IMAGEDATA_OFFSET
       local.get $11
       local.get $9
       local.get $15
       i32.add
       local.tee $9
       global.get $src/assembly/wasm/WIDTH
       i32.mul
       i32.add
       i32.const 2
       i32.shl
       i32.add
       global.get $src/assembly/wasm/MASKEDCOLOR
       i32.const 255
       i32.const 0
       local.get $7
       i32.const 31
       i32.shr_s
       local.tee $12
       local.get $7
       local.get $12
       i32.add
       i32.xor
       f32.convert_i32_s
       local.get $17
       f32.div
       local.get $18
       f32.sub
       f32.const 1
       f32.add
       f64.promote_f32
       f64.const 255
       f64.mul
       i32.trunc_sat_f64_s
       local.tee $12
       local.get $12
       i32.const 0
       i32.lt_s
       select
       i32.sub
       global.get $src/assembly/wasm/ALPHAPOS
       i32.shl
       i32.or
       i32.store
       local.get $7
       local.get $20
       i32.add
       local.set $7
       br $for-loop|2
      end
     end
     local.get $11
     local.get $22
     i32.eq
     br_if $while-break|1
     local.get $11
     local.get $16
     i32.add
     local.set $11
     local.get $4
     local.tee $7
     local.get $19
     i32.sub
     local.set $4
    end
    local.get $19
    local.get $7
    i32.const 1
    i32.shl
    i32.ge_s
    if
     local.get $20
     local.get $7
     i32.sub
     local.set $7
     loop $for-loop|3
      local.get $8
      local.get $22
      i32.ne
      local.get $19
      local.get $20
      i32.gt_s
      i32.or
      local.get $17
      local.get $18
      f32.mul
      i32.trunc_sat_f32_s
      local.get $7
      i32.gt_s
      i32.and
      if
       global.get $src/assembly/wasm/PATH_IMAGEDATA_OFFSET
       local.get $8
       local.get $16
       i32.add
       local.tee $8
       global.get $src/assembly/wasm/WIDTH
       local.get $10
       i32.mul
       i32.add
       i32.const 2
       i32.shl
       i32.add
       global.get $src/assembly/wasm/MASKEDCOLOR
       i32.const 255
       i32.const 0
       local.get $7
       i32.const 31
       i32.shr_s
       local.tee $9
       local.get $7
       local.get $9
       i32.add
       i32.xor
       f32.convert_i32_s
       local.get $17
       f32.div
       local.get $18
       f32.sub
       f32.const 1
       f32.add
       f64.promote_f32
       f64.const 255
       f64.mul
       i32.trunc_sat_f64_s
       local.tee $9
       local.get $9
       i32.const 0
       i32.lt_s
       select
       i32.sub
       global.get $src/assembly/wasm/ALPHAPOS
       i32.shl
       i32.or
       i32.store
       local.get $7
       local.get $19
       i32.add
       local.set $7
       br $for-loop|3
      end
     end
     local.get $10
     local.get $21
     i32.eq
     br_if $while-break|1
     local.get $10
     local.get $15
     i32.add
     local.set $10
     local.get $4
     local.get $20
     i32.add
     local.set $4
    end
    br $while-continue|1
   end
  end
 )
 (func $~lib/math/NativeMathf.sin (param $0 f32) (result f32)
  (local $1 f64)
  (local $2 i32)
  (local $3 i64)
  (local $4 i32)
  (local $5 f64)
  (local $6 f64)
  (local $7 i32)
  (local $8 i64)
  (local $9 i64)
  local.get $0
  i32.reinterpret_f32
  local.tee $2
  i32.const 31
  i32.shr_u
  local.set $4
  local.get $2
  i32.const 2147483647
  i32.and
  local.tee $2
  i32.const 1061752794
  i32.le_u
  if
   local.get $2
   i32.const 964689920
   i32.lt_u
   if
    local.get $0
    return
   end
   local.get $0
   f64.promote_f32
   local.tee $5
   local.get $5
   f64.mul
   local.tee $6
   local.get $5
   f64.mul
   local.set $1
   local.get $5
   local.get $1
   local.get $6
   f64.const 0.008333329385889463
   f64.mul
   f64.const -0.16666666641626524
   f64.add
   f64.mul
   f64.add
   local.get $1
   local.get $6
   local.get $6
   f64.mul
   f64.mul
   local.get $6
   f64.const 2.718311493989822e-06
   f64.mul
   f64.const -1.9839334836096632e-04
   f64.add
   f64.mul
   f64.add
   f32.demote_f64
   return
  end
  local.get $2
  i32.const 2139095040
  i32.ge_u
  if
   local.get $0
   local.get $0
   f32.sub
   return
  end
  block $~lib/math/rempio2f|inlined.0 (result i32)
   local.get $2
   i32.const 1305022427
   i32.lt_u
   if
    local.get $0
    f64.promote_f32
    local.get $0
    f64.promote_f32
    f64.const 0.6366197723675814
    f64.mul
    f64.nearest
    local.tee $1
    f64.const 1.5707963109016418
    f64.mul
    f64.sub
    local.get $1
    f64.const 1.5893254773528196e-08
    f64.mul
    f64.sub
    global.set $~lib/math/rempio2f_y
    local.get $1
    i32.trunc_sat_f64_s
    br $~lib/math/rempio2f|inlined.0
   end
   local.get $2
   i32.const 23
   i32.shr_s
   i32.const 152
   i32.sub
   local.tee $7
   i32.const 63
   i32.and
   i64.extend_i32_s
   local.set $8
   local.get $7
   i32.const 6
   i32.shr_s
   i32.const 3
   i32.shl
   i32.const 1024
   i32.add
   local.tee $7
   i64.load offset=8
   local.set $3
   f64.const 8.515303950216386e-20
   local.get $0
   f64.promote_f32
   f64.copysign
   local.get $2
   i32.const 8388607
   i32.and
   i32.const 8388608
   i32.or
   i64.extend_i32_s
   local.tee $9
   local.get $7
   i64.load
   local.get $8
   i64.shl
   local.get $3
   i64.const 64
   local.get $8
   i64.sub
   i64.shr_u
   i64.or
   i64.mul
   local.get $8
   i64.const 32
   i64.gt_u
   if (result i64)
    local.get $3
    local.get $8
    i64.const 32
    i64.sub
    i64.shl
    local.get $7
    i64.load offset=16
    i64.const 96
    local.get $8
    i64.sub
    i64.shr_u
    i64.or
   else
    local.get $3
    i64.const 32
    local.get $8
    i64.sub
    i64.shr_u
   end
   local.get $9
   i64.mul
   i64.const 32
   i64.shr_u
   i64.add
   local.tee $3
   i64.const 2
   i64.shl
   local.tee $8
   f64.convert_i64_s
   f64.mul
   global.set $~lib/math/rempio2f_y
   i32.const 0
   local.get $3
   i64.const 62
   i64.shr_u
   local.get $8
   i64.const 63
   i64.shr_u
   i64.add
   i32.wrap_i64
   local.tee $2
   i32.sub
   local.get $2
   local.get $4
   select
  end
  local.set $2
  global.get $~lib/math/rempio2f_y
  local.set $1
  local.get $2
  i32.const 1
  i32.and
  if (result f32)
   local.get $1
   local.get $1
   f64.mul
   local.tee $1
   local.get $1
   f64.mul
   local.set $5
   local.get $1
   f64.const -0.499999997251031
   f64.mul
   f64.const 1
   f64.add
   local.get $5
   f64.const 0.04166662332373906
   f64.mul
   f64.add
   local.get $5
   local.get $1
   f64.mul
   local.get $1
   f64.const 2.439044879627741e-05
   f64.mul
   f64.const -0.001388676377460993
   f64.add
   f64.mul
   f64.add
   f32.demote_f64
  else
   local.get $1
   local.get $1
   local.get $1
   f64.mul
   local.tee $5
   local.get $1
   f64.mul
   local.tee $1
   local.get $5
   f64.const 0.008333329385889463
   f64.mul
   f64.const -0.16666666641626524
   f64.add
   f64.mul
   f64.add
   local.get $1
   local.get $5
   local.get $5
   f64.mul
   f64.mul
   local.get $5
   f64.const 2.718311493989822e-06
   f64.mul
   f64.const -1.9839334836096632e-04
   f64.add
   f64.mul
   f64.add
   f32.demote_f64
  end
  local.tee $0
  f32.neg
  local.get $0
  local.get $2
  i32.const 2
  i32.and
  select
 )
 (func $~lib/math/NativeMathf.log (param $0 f32) (result f32)
  (local $1 i32)
  (local $2 i32)
  (local $3 f32)
  (local $4 f32)
  (local $5 f32)
  local.get $0
  i32.reinterpret_f32
  local.tee $1
  i32.const 31
  i32.shr_u
  local.get $1
  i32.const 8388608
  i32.lt_u
  i32.or
  if
   local.get $1
   i32.const 1
   i32.shl
   i32.eqz
   if
    f32.const -1
    local.get $0
    local.get $0
    f32.mul
    f32.div
    return
   end
   local.get $1
   i32.const 31
   i32.shr_u
   if
    local.get $0
    local.get $0
    f32.sub
    f32.const 0
    f32.div
    return
   end
   i32.const -25
   local.set $2
   local.get $0
   f32.const 33554432
   f32.mul
   i32.reinterpret_f32
   local.set $1
  else
   local.get $1
   i32.const 2139095040
   i32.ge_u
   if
    local.get $0
    return
   else
    local.get $1
    i32.const 1065353216
    i32.eq
    if
     f32.const 0
     return
    end
   end
  end
  local.get $1
  i32.const 4913933
  i32.add
  local.tee $1
  i32.const 8388607
  i32.and
  i32.const 1060439283
  i32.add
  f32.reinterpret_i32
  f32.const 1
  f32.sub
  local.tee $0
  local.get $0
  f32.const 2
  f32.add
  f32.div
  local.tee $4
  local.get $4
  f32.mul
  local.tee $3
  local.get $3
  f32.mul
  local.set $5
  local.get $4
  local.get $0
  f32.const 0.5
  f32.mul
  local.get $0
  f32.mul
  local.tee $4
  local.get $3
  local.get $5
  f32.const 0.2849878668785095
  f32.mul
  f32.const 0.6666666269302368
  f32.add
  f32.mul
  local.get $5
  local.get $5
  f32.const 0.24279078841209412
  f32.mul
  f32.const 0.40000972151756287
  f32.add
  f32.mul
  f32.add
  f32.add
  f32.mul
  local.get $1
  i32.const 23
  i32.shr_s
  i32.const 127
  i32.sub
  local.get $2
  i32.add
  f32.convert_i32_s
  local.tee $3
  f32.const 9.05800061445916e-06
  f32.mul
  f32.add
  local.get $4
  f32.sub
  local.get $0
  f32.add
  local.get $3
  f32.const 0.6931381225585938
  f32.mul
  f32.add
 )
 (func $src/assembly/wasm/CRSproject@varargs (param $0 i32) (param $1 i32) (param $2 i32)
  (local $3 i32)
  (local $4 f32)
  (local $5 f32)
  (local $6 f32)
  block $1of1
   block $0of1
    block $outOfRange
     global.get $~argumentsLength
     i32.const 2
     i32.sub
     br_table $0of1 $1of1 $outOfRange
    end
    unreachable
   end
   i32.const 0
   local.set $2
  end
  i32.const 1
  local.get $2
  i32.const 255
  i32.and
  i32.const 8
  i32.add
  i32.shl
  f32.convert_i32_s
  local.set $4
  i32.const 0
  local.set $2
  loop $for-loop|0
   local.get $1
   local.get $2
   i32.gt_s
   if
    local.get $2
    i32.const 2
    i32.shl
    local.get $0
    i32.add
    local.tee $3
    f32.load offset=4
    local.set $5
    local.get $4
    f32.const 85.05113220214844
    local.get $3
    f32.load
    f32.min
    f32.const -85.05113220214844
    f32.max
    f32.const 0.01745329238474369
    f32.mul
    call $~lib/math/NativeMathf.sin
    local.tee $6
    f32.const 1
    f32.add
    f32.const 1
    local.get $6
    f32.sub
    f32.div
    call $~lib/math/NativeMathf.log
    f32.const 6378137
    f32.mul
    f32.const 0.5
    f32.mul
    f32.const -2.4953202171218436e-08
    f32.mul
    f32.const 0.5
    f32.add
    f32.mul
    local.set $6
    local.get $3
    local.get $4
    local.get $5
    f32.const 6378137
    f32.mul
    f32.const 0.01745329238474369
    f32.mul
    f32.const 2.4953202171218436e-08
    f32.mul
    f32.const 0.5
    f32.add
    f32.mul
    f32.store
    local.get $3
    local.get $6
    f32.store offset=4
    local.get $2
    i32.const 1
    i32.add
    local.set $2
    br $for-loop|0
   end
  end
 )
 (func $~setArgumentsLength (param $0 i32)
  local.get $0
  global.set $~argumentsLength
 )
)
