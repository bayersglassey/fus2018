

#include "includes.h"


const char *fus_err_code_msg(fus_err_code_t code){
    static const char *codes[FUS_ERRS] = {
        "Wrong type",
        "Overflow",
        "Underflow"
    };
    if(code < 0 || code >= FUS_ERRS)return "Unknown";
    return codes[code];
}



fus_value_t fus_err(fus_err_code_t code){
#if FUS_PRINT_ERRS_TO_STDERR
    const char *msg = fus_err_code_msg(code);
    fprintf(stderr, "{Fus err #%i: %s}", code, msg);
#endif
#if FUS_USE_CURRENT_ERR_CODE
    fus_current_err_code = code;
#endif
#if FUS_ABORT_ON_ERR
    abort();
#endif
    return FUS_VALUE_ERR;
}


fus_value_t fus_sym(fus_sym_i_t sym_i){
    fus_value_t value = FUS_BUILD(FUS_TAG_SYM, sym_i);
    return value;
}

fus_sym_i_t fus_sym_decode(fus_value_t value){
    if(FUS_GET_TAG(value) != FUS_TAG_SYM){
#if FUS_PRINT_ERRS_TO_STDERR
        fprintf(stderr, "{Fus error: %li is not a sym}", value.i);
#endif
#if FUS_ABORT_ON_ERR
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
#if FUS_PRINT_ERRS_TO_STDERR
        fprintf(stderr, "{Fus error: %li is not an int}", value.i);
#endif
#if FUS_ABORT_ON_ERR
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

    if(tag_x == FUS_TAG_COLLECTION)return fus_err(FUS_ERR_WRONG_TYPE);
        /* Can't compare arr, obj, str, fun.
        TODO: It should be possible to compare everything except fun */

    return fus_bool(value_x.i == value_y.i);
}




/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_init_value(fus_class_t *class, void *ptr){
    fus_value_t *value_ptr = ptr;
    value_ptr->i = FUS_VALUE_ERR.i;
}

void fus_class_cleanup_value(fus_class_t *class, void *ptr){
    fus_value_t *value_ptr = ptr;
    fus_value_t value = *value_ptr;
    fus_tag_t tag = FUS_GET_TAG(value);
    if(tag == FUS_TAG_COLLECTION)fus_collection_cleanup(value.c);
}


