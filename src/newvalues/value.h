#ifndef _FUS_VALUE_H_
#define _FUS_VALUE_H_


#include <limits.h>

#define FUS_PRINT_ERRS_TO_STDERR



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
#define FUS_INT_MIN LONG_MIN
#define FUS_INT_MAX LONG_MAX

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


typedef enum {
    FUS_ERR_WRONG_TYPE,
    FUS_ERR_OVERFLOW,
    FUS_ERR_UNDERFLOW,
    FUS_ERRS
} fus_err_code_t;

const char *fus_err_code_msgs[FUS_ERRS] = {
    "Wrong type",
    "Overflow",
    "Underflow"
};


#ifdef FUS_USE_CURRENT_ERR_CODE
extern fus_err_code_t fus_current_err_code;
#endif


fus_value_t fus_err(fus_err_code_t code){
#ifdef FUS_PRINT_ERRS_TO_STDERR
    const char *msg = "Unknown";
    if(code >= 0 && code < FUS_ERRS)msg = fus_err_code_msgs[code];
    fprintf(stderr, "{Fus err #%i: %s}", code, msg);
#endif
#ifdef FUS_USE_CURRENT_ERR_CODE
    fus_current_err_code = code;
#endif
#ifdef FUS_ABORT_ON_ERR
    abort();
#endif
    return FUS_VALUE_ERR;
}


fus_value_t fus_sym(fus_int_t i){
    fus_value_t value = FUS_BUILD(FUS_TAG_SYM, i);
    return value;
}

fus_int_t fus_sym_decode(fus_value_t value){
    if(FUS_GET_TAG(value) != FUS_TAG_SYM){
#ifdef FUS_PRINT_ERRS_TO_STDERR
        fprintf(stderr, "{Fus error: %li is not a sym}", value.i);
#endif
#ifdef FUS_ABORT_ON_ERR
        abort();
#endif
        return 0;
    }
    return FUS_GET_PAYLOAD(value);
}


fus_value_t fus_int(fus_int_t i){
    fus_value_t value = FUS_BUILD(FUS_TAG_INT, i);
    if(FUS_GET_PAYLOAD(value) != i){
        /* If i is too big (if it uses either of the first 2 bits),
        we would lose precision when building the fus value. */
        return fus_err(FUS_ERR_OVERFLOW);
    }
    return value;
}

fus_int_t fus_int_decode(fus_value_t value){
    if(FUS_GET_TAG(value) != FUS_TAG_INT){
#ifdef FUS_PRINT_ERRS_TO_STDERR
        fprintf(stderr, "{Fus error: %li is not an int}", value.i);
#endif
#ifdef FUS_ABORT_ON_ERR
        abort();
#endif
        return 0;
    }
    return FUS_GET_PAYLOAD(value);
}

fus_value_t fus_int_add(fus_value_t value_x, fus_value_t value_y){
    if(FUS_GET_TAG(value_x) != FUS_TAG_INT)return fus_err(FUS_ERR_WRONG_TYPE);
    if(FUS_GET_TAG(value_y) != FUS_TAG_INT)return fus_err(FUS_ERR_WRONG_TYPE);
    fus_int_t x = FUS_GET_PAYLOAD(value_x);
    fus_int_t y = FUS_GET_PAYLOAD(value_y);

    /* overflow/underflow checks */
    /* Taken from https://stackoverflow.com/a/1514309 */
    if((x > 0) && (y > FUS_INT_MAX - x))return fus_err(FUS_ERR_OVERFLOW);
    if((x < 0) && (y < FUS_INT_MIN - x))return fus_err(FUS_ERR_UNDERFLOW);

    fus_int_t z = x + y;
    return fus_int(z);
}

fus_value_t fus_int_sub(fus_value_t value_x, fus_value_t value_y){
    if(FUS_GET_TAG(value_x) != FUS_TAG_INT)return fus_err(FUS_ERR_WRONG_TYPE);
    if(FUS_GET_TAG(value_y) != FUS_TAG_INT)return fus_err(FUS_ERR_WRONG_TYPE);
    fus_int_t x = FUS_GET_PAYLOAD(value_x);
    fus_int_t y = FUS_GET_PAYLOAD(value_y);

    /* overflow/underflow checks */
    /* Taken from https://stackoverflow.com/a/1514309 */
    if((x < 0) && (y > FUS_INT_MAX + x))return fus_err(FUS_ERR_OVERFLOW);
    if((x > 0) && (y < FUS_INT_MIN + x))return fus_err(FUS_ERR_UNDERFLOW);

    fus_int_t z = x - y;
    return fus_int(z);
}

fus_value_t fus_int_mul(fus_value_t value_x, fus_value_t value_y){
    if(FUS_GET_TAG(value_x) != FUS_TAG_INT)return fus_err(FUS_ERR_WRONG_TYPE);
    if(FUS_GET_TAG(value_y) != FUS_TAG_INT)return fus_err(FUS_ERR_WRONG_TYPE);
    fus_int_t x = FUS_GET_PAYLOAD(value_x);
    fus_int_t y = FUS_GET_PAYLOAD(value_y);

    /* overflow/underflow checks */
    /* Taken from https://stackoverflow.com/a/1514309 */
    if(y > FUS_INT_MAX / x)return fus_err(FUS_ERR_OVERFLOW);
    if(y < FUS_INT_MIN / x)return fus_err(FUS_ERR_UNDERFLOW);
    /* The following checks are apparently only necessary on two's compliment machines */
    if((x == -1) && (y == FUS_INT_MIN))return fus_err(FUS_ERR_OVERFLOW);
    if((y == -1) && (x == FUS_INT_MIN))return fus_err(FUS_ERR_OVERFLOW);

    fus_int_t z = x * y;
    return fus_int(z);
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

    if(tag_x == FUS_TAG_PTR)return fus_err(FUS_ERR_WRONG_TYPE);
        /* Can't compare arr, obj, str, fun.
        TODO: It should be possible to compare everything except fun */

    return fus_bool(value_x.i == value_y.i);
}


#endif