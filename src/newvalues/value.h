

#define FUS_TAG_PTR   0x0
#define FUS_TAG_INT   0x1
#define FUS_TAG_SYM   0x2
#define FUS_TAG_OTHER 0x3
#define FUS_GET_TAG(x) ((x).i & ~0x3)
#define FUS_GET_PAYLOAD(x) ((x).i >> 2)
#define FUS_BUILD(tag, x) ((fus_value_t)( \
    ((fus_payload_t)(x) << 2) | (fus_tag_t)(tag) \
))


#define FUS_VALUE_ERR   FUS_BUILD(FUS_TAG_PTR,   0)
    /* NOTE: FUS_VALUE_ERR == NULL */

#define FUS_VALUE_NULL  FUS_BUILD(FUS_TAG_OTHER, 0)
#define FUS_VALUE_TRUE  FUS_BUILD(FUS_TAG_OTHER, 1)
#define FUS_VALUE_FALSE FUS_BUILD(FUS_TAG_OTHER, 2)


typedef long int fus_int_t;
typedef unsigned long int fus_uint_t;

typedef fus_uint_t fus_built_t;
typedef fus_uint_t fus_tag_t;
typedef fus_int_t fus_payload_t;

typedef union {
    fus_built_t i;
    struct fus_arr_t *a;
    struct fus_obj_t *o;
    struct fus_str_t *s;
    struct fus_fun_t *f;
} fus_value_t;



fus_value_t fus_int(fus_int_t i){
    fus_value_t value = FUS_BUILD(FUS_TAG_INT, i);
    if(FUS_GET_PAYLOAD(value) != i){
        /* If i is too big (if it uses either of the first 2 bits),
        we would lose precision when building the fus value.
        So we return an error fus value instead. */
        return FUS_VALUE_ERR;
    }
    return value;
}

fus_int_t fus_int_decode(fus_value_t value){
    if(FUS_GET_TAG(value) != FUS_TAG_INT)return 0;
    return FUS_GET_PAYLOAD(value);
}

fus_value_t fus_int_add(fus_value_t value_x, fus_value_t value_y){
    if(FUS_GET_TAG(value_x) != FUS_TAG_INT)return FUS_VALUE_ERR;
    if(FUS_GET_TAG(value_y) != FUS_TAG_INT)return FUS_VALUE_ERR;
    fus_int_t x = FUS_GET_PAYLOAD(value_x);
    fus_int_t y = FUS_GET_PAYLOAD(value_y);
    fus_int_t z = x + y;
    return FUS_BUILD(FUS_TAG_INT, z);
}

fus_value_t fus_bool(bool b){
    return b? FUS_VALUE_TRUE: FUS_VALUE_FALSE;
}

bool fus_bool_decode(fus_value_t value){
    return value.i == FUS_VALUE_TRUE.i;
}

fus_value_t fus_eq(fus_value_t value_x, fus_value_t value_y){
    fus_tag_t tag_x = FUS_GET_TAG(value_x);
    fus_tag_t tag_y = FUS_GET_TAG(value_y);
    if(tag_x != tag_y)return FUS_VALUE_FALSE;

    if(tag_x == FUS_TAG_PTR)return FUS_VALUE_ERR;
        /* Can't compare arr, obj, str, fun.
        TODO: It should be possible to compare everything except fun */

    return fus_bool(value_x.i == value_y.i);
}

