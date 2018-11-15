#ifndef _FUS_STACK_H_
#define _FUS_STACK_H_



typedef struct fus_stack {
    fus_value_t tos; /* Top Of Stack */
    fus_value_t nos; /* Next On Stack */
    ARRAY_DECL(fus_value_t, tail) /* Rest of stack */
} fus_stack_t;


void fus_stack_cleanup(fus_stack_t *stack);
int fus_stack_init(fus_stack_t *stack);
int fus_stack_len(fus_stack_t *stack);
int fus_stack_push(fus_stack_t *stack, fus_value_t value);
int fus_stack_pop(fus_stack_t *stack, fus_value_t *value_ptr);

#define FUS_STACK_SET_TOS(s, x) { \
    fus_value_t value = (x); \
    fus_value_detach((s).tos); \
    (s).tos = value; \
    fus_value_attach(value); \
}

#define FUS_STACK_SET_NOS(s, x) { \
    fus_value_t value = (x); \
    fus_value_detach((s).nos); \
    (s).nos = value; \
    fus_value_attach(value); \
}

#define FUS_STACK_PUSH(s, x) { \
    int err = fus_stack_push(&(s), (x)); \
    if(err)return err; \
}

#define FUS_STACK_POP(s, x) { \
    int err = fus_stack_pop(&(s), &(x)); \
    if(err)return err; \
}


#endif