#ifndef _FUS_STACK_H_
#define _FUS_STACK_H_



typedef struct fus_stack {
    fus_value_t tos; /* Top Of Stack */
    fus_value_t nos; /* Next On Stack */
    ARRAY_DECL(fus_value_t, tail) /* Rest of stack */
} fus_stack_t;


#define FUS_STACK_PUSH(s, x) { \
    if((s).nos.type != FUS_TYPE_NULL){ \
        ARRAY_PUSH(fus_value_t, (s).tail, (s).nos) \
    } \
    (s).nos = (s).tos; \
    (s).tos = x; \
    fus_value_attach(x); \
}

#define FUS_STACK_POP(s, x) { \
    x = (s).tos; \
    (s).tos = (s).nos; \
    if((s).tail_len > 0){ \
        (s).nos = (s).tail[(s).tail_len - 1]; \
        (s).tail[(s).tail_len - 1] = fus_value_null(); \
        (s).tail_len--; \
    }else{ \
        (s).nos = fus_value_null(); \
    } \
}


void fus_stack_cleanup(fus_stack_t *stack);
int fus_stack_init(fus_stack_t *stack);


#endif