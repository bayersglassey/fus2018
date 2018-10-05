
# FUS keywords

Modules & Functions

    def sig module load use @ &

General

    data typeof is

Stack

    dup drop swap nip over

Vars

    'x ''x ='x

Control

    if ifelse do next break while

Debug

    p stack vars assert error ignore

Null

    null

Bool

    t f not and or bool_eq

Int

    123 + - * / mod neg < > <= >= == != int_tostr

Str

    "abc"
    str_eq str_len str_split str_join str_indexof str_get str_set
    str_toarr str_tosym str_tocode str_fromcode str_p

Sym

    `x sym_eq sym_tostr

Obj

    obj .x ..x =.x ?.x get rip set has keys

Arr

    arr len , push pop lpush lpop split join repeat .$ ..$ =.$ ?.$

Fun

    fun call

