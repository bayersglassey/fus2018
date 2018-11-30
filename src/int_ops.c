

#include "includes.h"



fus_value_t fus_value_int_neg(fus_vm_t *vm, fus_value_t value_x){
    if(!FUS_IS_INT(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_unboxed_t x = FUS_GET_PAYLOAD(value_x.i);
    /* TODO: Can negating an int cause overflow?.. */
    return fus_value_int(vm, -x);
}

fus_value_t fus_value_int_tostr(fus_vm_t *vm, fus_value_t value_x){
    if(!FUS_IS_INT(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_unboxed_t x = FUS_GET_PAYLOAD(value_x.i);
    const char *text = fus_write_long_int(x);
    if(text == NULL){
        fprintf(stderr, "%s: Buffer too small\n", __func__);
        return fus_value_err(vm, FUS_ERR_IDUNNO);
    }
    int len = fus_strlen(vm->core, text);
    char *new_text = fus_strndup(vm->core, text, len);
    return fus_value_str(vm, new_text, len, len + 1);
}


FUS_VALUE_INT_BINOP(add){
    if(!FUS_IS_INT(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    if(!FUS_IS_INT(value_y))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_unboxed_t x = FUS_GET_PAYLOAD(value_x.i);
    fus_unboxed_t y = FUS_GET_PAYLOAD(value_y.i);

    /* overflow/underflow checks */
    /* Taken from https://stackoverflow.com/a/1514309 */
    if((x > 0) && (y > FUS_PAYLOAD_MAX - x))return fus_value_err(vm, FUS_ERR_OVERFLOW);
    if((x < 0) && (y < FUS_PAYLOAD_MIN - x))return fus_value_err(vm, FUS_ERR_UNDERFLOW);

    fus_unboxed_t z = x + y;
    return fus_value_int(vm, z);
}

FUS_VALUE_INT_BINOP(sub){
    if(!FUS_IS_INT(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    if(!FUS_IS_INT(value_y))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_unboxed_t x = FUS_GET_PAYLOAD(value_x.i);
    fus_unboxed_t y = FUS_GET_PAYLOAD(value_y.i);

    /* overflow/underflow checks */
    /* Taken from https://stackoverflow.com/a/1514309 */
    if((x < 0) && (y > FUS_PAYLOAD_MAX + x))return fus_value_err(vm, FUS_ERR_OVERFLOW);
    if((x > 0) && (y < FUS_PAYLOAD_MIN + x))return fus_value_err(vm, FUS_ERR_UNDERFLOW);

    fus_unboxed_t z = x - y;
    return fus_value_int(vm, z);
}

FUS_VALUE_INT_BINOP(mul){
    if(!FUS_IS_INT(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    if(!FUS_IS_INT(value_y))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_unboxed_t x = FUS_GET_PAYLOAD(value_x.i);
    fus_unboxed_t y = FUS_GET_PAYLOAD(value_y.i);

    /* overflow/underflow checks */
    /* Taken from https://stackoverflow.com/a/1514309 */
    if(y > FUS_PAYLOAD_MAX / x)return fus_value_err(vm, FUS_ERR_OVERFLOW);
    if(y < FUS_PAYLOAD_MIN / x)return fus_value_err(vm, FUS_ERR_UNDERFLOW);
    /* The following checks are apparently only necessary on two's compliment machines */
    if((x == -1) && (y == FUS_PAYLOAD_MIN))return fus_value_err(vm, FUS_ERR_OVERFLOW);
    if((y == -1) && (x == FUS_PAYLOAD_MIN))return fus_value_err(vm, FUS_ERR_OVERFLOW);

    fus_unboxed_t z = x * y;
    return fus_value_int(vm, z);
}


static int _div(int x, int y){
    /* y is assumed to be non-negative */
    if(x < 0)return (x - (y-1)) / y;
    return x / y;
}

static int _rem(int x, int y){
    /* y is assumed to be non-negative */
    if(x < 0)return (y - 1) + (x - (y-1)) % y;
    return x % y;
}

FUS_VALUE_INT_BINOP(div){
    if(!FUS_IS_INT(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    if(!FUS_IS_INT(value_y))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_unboxed_t x = FUS_GET_PAYLOAD(value_x.i);
    fus_unboxed_t y = FUS_GET_PAYLOAD(value_y.i);

    fprintf(stderr, "%s: TODO: Check over/under flow, etc\n", __func__);
    /* See: https://en.wikipedia.org/wiki/Euclidean_division */

    if(y == 0)return fus_value_err(vm, x>0?
        FUS_ERR_OVERFLOW: FUS_ERR_UNDERFLOW);

    fus_unboxed_t abs_y = y < 0? -y: y;
    fus_unboxed_t z = _div(x, abs_y);
    if(y < 0)z = -z;
    return fus_value_int(vm, z);
}

FUS_VALUE_INT_BINOP(mod){
    if(!FUS_IS_INT(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    if(!FUS_IS_INT(value_y))return fus_value_err(vm, FUS_ERR_WRONG_TYPE);
    fus_unboxed_t x = FUS_GET_PAYLOAD(value_x.i);
    fus_unboxed_t y = FUS_GET_PAYLOAD(value_y.i);

    fprintf(stderr, "%s: TODO: Check over/under flow, etc\n", __func__);
    /* See: https://en.wikipedia.org/wiki/Euclidean_division */

    if(y == 0)return fus_value_err(vm, x>0?
        FUS_ERR_OVERFLOW: FUS_ERR_UNDERFLOW);

    fus_unboxed_t abs_y = y < 0? -y: y;
    fus_unboxed_t z = _rem(x, abs_y);
    return fus_value_int(vm, z);
}



#define FUS_VALUE_INT_COMPARISON(OP) \
    /* TODO: Overflow checks for lt/gt/etc?.. */ \
    if(!FUS_IS_INT(value_x))return fus_value_err(vm, FUS_ERR_WRONG_TYPE); \
    if(!FUS_IS_INT(value_y))return fus_value_err(vm, FUS_ERR_WRONG_TYPE); \
    return fus_value_bool(vm, value_x.i OP value_y.i);

FUS_VALUE_INT_BINOP(eq){
FUS_VALUE_INT_COMPARISON(==)
}

FUS_VALUE_INT_BINOP(ne){
FUS_VALUE_INT_COMPARISON(!=)
}

FUS_VALUE_INT_BINOP(lt){
FUS_VALUE_INT_COMPARISON(<)
}

FUS_VALUE_INT_BINOP(gt){
FUS_VALUE_INT_COMPARISON(>)
}

FUS_VALUE_INT_BINOP(le){
FUS_VALUE_INT_COMPARISON(<=)
}

FUS_VALUE_INT_BINOP(ge){
FUS_VALUE_INT_COMPARISON(>=)
}


