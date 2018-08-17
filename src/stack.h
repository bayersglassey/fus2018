#ifndef _FUS_STACK_H_
#define _FUS_STACK_H_

#include "array.h"
#include "value.h"



typedef struct fus_stack {
    fus_value_t tos; /* Top Of Stack */
    fus_value_t nos; /* Next On Stack */
    ARRAY_DECL(fus_value_t, tail) /* Rest of stack */
} fus_stack_t;

#define FUS_STACK_PUSH(s, v, x) { \
    if(s.nos.type != FUS_TYPE_NULL){ \
        ARRAY_PUSH(fus_value_t, s.tail, s.nos) \
    } \
    s.nos = s.tos; \
    s.tos = x; \
    fus_value_attach(x); \
}

#define FUS_STACK_POP(s, v, x) { \
    x = s.tos; \
    s.tos = s.nos; \
    if(s.tail_len > 0){ \
        s.nos = s.tail[s.tail_len - 1]; \
        s.tail[s.tail_len - 1] = fus_value_null(); \
        s.tail_len--; \
    }else{ \
        s.nos = fus_value_null(); \
    } \
}


#endif