
# FUS keywords

Modules & Functions

    def sig module load use @ &

General

    data typeof is_null is_bool is_int is_str is_sym is_obj is_arr is_fun is_gen

Labels

    ~x

Stack

    dup drop swap nip over

Vars

    'x ''x ='x

Control

    if ifelse do loop break while until return restart

Debug

    p stack vars assert error ignore

Null

    null

Bool

    T F not and or bool_eq

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

    arr .0 len , push pop lpush lpop split join tuple repeat .$ ..$ =.$ ?.$
    arr_togen

Fun

    fun call

Gen

    gen done out >> for

